"""PartsDonor backend — FastAPI app и роуты (маркетплейс-слой поверх InvenTree).

Роуты (MVP-scope):
  - GET    /health                 — статус backend + связь с InvenTree
  - GET    /catalog                — каталог деталей из InvenTree (поиск бренд/модель/тип)
  - GET    /donor/{donor_part_id}  — развёртка донора через BOM InvenTree + наши листинги
  - CRUD   /companies              — мастерские (продавцы/покупатели)
  - CRUD   /device-schemas         — развёртки моделей (hotspots → part)
  - CRUD   /listings               — объявления на витрине
  -        /deals                  — сделки (создание + статусная машина + escrow)
  -        /reviews                — отзывы/рейтинги продавцов
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import engine, get_db
from app.deal_machine import ESCROW_BY_DEAL, validate_transition
from app.inventree_client import inventree
from app.auth import admin_router, auth_router, get_current_user, optional_user, require_roles
from app.models import (
    User,
    UserRole,
    Base,
    BuyerProfile,
    BuyRequest,
    BuyRequestStatus,
    BuyResponseStatus,
    BuyRequestType,
    BuyRequestResponse,
    Company,
    Deal,
    DealStatus,
    DeviceSchema,
    Donor,
    DonorLot,
    DonorPart,
    DonorRequest,
    DonorStatus,
    Listing,
    ListingStatus,
    ListingSubscription,
    PartCondition,
    Photo,
    Review,
    Dialog,
    DialogParticipant,
    Message,
    Offer,
    MessageKind,
    OfferStatus,
)
from app.schemas import (
    CatalogDetail,
    CatalogItem,
    CatalogListingOut,
    CompanyIn,
    CompanyOut,
    DealCreateIn,
    DealOut,
    DealTransitionIn,
    DealTransitionOut,
    DealPayIn,
    DealPayOut,
    BuyerProfileIn,
    BuyerProfileOut,
    OneClickDealIn,
    OneClickDealOut,
    DeviceSchemaIn,
    DeviceSchemaOut,
    DonorComponent,
    DonorSchema,
    DonorIn,
    DonorOut,
    DonorDetail,
    DonorUpdate,
    DonorPublishOut,
    DonorPartIn,
    DonorPartOut,
    PhotoOut,
    UploadOut,
    HealthOut,
    ListingIn,
    ListingOut,
    ListingUpdate,
    ReviewIn,
    ReviewOut,
    SubscriptionIn,
    SubscriptionOut,
    SubscriptionStatusOut,
    NotificationOut,
    WebhookAck,
    DonorLotIn,
    DonorLotOut,
    DonorLotDetail,
    DonorRequestIn,
    DonorRequestOut,
    # BE-2
    BuyRequestIn,
    BuyRequestUpdate,
    BuyRequestOut,
    BuyRequestDetailOut,
    BuyResponseIn,
    BuyResponseOut,
    BuyCountersOut,
    # BE-3
    DialogCreateIn,
    DialogParticipantOut,
    DialogOut,
    DialogDetailOut,
    MessageOut,
    MessageSendIn,
    OfferOut,
    DialogReadOut,
)
from app.yookassa_client import new_payment_id, yookassa

log = logging.getLogger("partsdonor.main")

app = FastAPI(title="PartsDonor API", version="0.2.0")
router = APIRouter()


async def _part_info(part_id):
    if not part_id:
        return (None, None)
    try:
        p = await inventree.get_part(int(part_id))
    except Exception:
        return (None, None)
    name = p.get("name") or None
    cat_name = None
    raw = p.get("category")
    if isinstance(raw, int):
        cat_name = (await inventree.category_name_map()).get(raw)
    return (name, cat_name)


def _warranty(condition: str | None) -> bool:
    """Гарантия на деталь, выводимая из состояния листинга.

    Отсутствует только у деталей без гарантии (no_guarantee); во всех остальных
    состоянии (working/for_parts/untested) мастерская даёт гарантию. Данных о
    гарантийном сроке в модели пока нет — это булево присутствие гарантии.
    """
    return condition != PartCondition.no_guarantee.value


async def _resolve_brand_model_parts(
    db: AsyncSession, brand: str | None, model: str | None
) -> set[int] | None:
    """Детали по бренду/модели телефона — через наши device_schemas и донор.

    Ищет схемы (развёртки) моделей по brand/model; для каждой берёт донора
    (inventree_donor_part_id) и его BOM-компоненты, возвращает множество pk Part,
    которые показываем в каталоге. Если бренд/модель не заданы — None (фильтра нет).
    """
    if not brand and not model:
        return None

    stmt = select(DeviceSchema)
    if brand:
        stmt = stmt.where(DeviceSchema.brand.ilike(f"%{brand}%"))
    if model:
        stmt = stmt.where(DeviceSchema.model.ilike(f"%{model}%"))
    schemas = (await db.execute(stmt)).scalars().all()

    # доноры всех схем — их BOM-компоненты тянем ПАРАЛЛЕЛЬНО (asyncio.gather),
    # не последовательно (это был главный узкий бутылочек бренд/модель-запросов)
    donor_ids = [s.inventree_donor_part_id for s in schemas if s.inventree_donor_part_id is not None]
    part_ids: set[int] = set(donor_ids)
    if donor_ids:
        bom_lists = await asyncio.gather(
            *(inventree.get_bom_subs(d) for d in donor_ids),
            return_exceptions=True,
        )
        for bom in bom_lists:
            if isinstance(bom, BaseException):
                continue  # один сбой BOM не роняет весь каталог бренд/модели
            for comp in bom:
                cid = comp.get("part_id")
                if cid is not None:
                    part_ids.add(int(cid))
    return part_ids


# ============================== HEALTH ==============================


@router.get("/health", response_model=HealthOut)
async def health() -> HealthOut:
    return HealthOut(
        partsdonor_backend="ok",
        inventree=await inventree.health(),
        inventree_base_url=inventree.base_url,
    )


# ============================== CATALOG (из InvenTree) ==============================


@router.get("/catalog", response_model=list[CatalogItem])
async def catalog(
    q: str | None = Query(default=None, description="Поиск по названию бренда/модели/типа"),
    brand: str | None = Query(default=None, description="Бренд телефона (через device_schemas)"),
    model: str | None = Query(default=None, description="Модель телефона (через device_schemas)"),
    category: int | None = Query(default=None, description="id категории InvenTree"),
    category_name: str | None = Query(default=None, description="Тип детали — имя категории (подстрока)"),
    status: ListingStatus | None = Query(default=None, description="статус листинга"),
    price_from: float | None = Query(default=None, description="Мин. цена"),
    price_to: float | None = Query(default=None, description="Макс. цена"),
    only_stock: bool = Query(default=False, description="Только в наличии на складе"),
    sort: str | None = Query(default=None, description="price_asc|price_desc|name"),
    db: AsyncSession = Depends(get_db),
) -> list[CatalogItem]:
    """Каталог деталей. Данные — из InvenTree (source of truth), цены — с наших листингов.

    Поиск: q (имя), brand/model (модель телефона — через device_schemas и донор+его BOM),
    category/category_name (тип детали). Фильтры накладываются И.
    """
    # Ограничение множества деталей по бренду/модели телефона (через наш слой)
    brand_model_parts = await _resolve_brand_model_parts(db, brand, model)

    # Параллельно запускаем все НЕЗАВИСИМЫЕ InvenTree-чтения и DB-чтение.
    # list_categories вызываем ОДИН раз и используем для обоих целей:
    # фильтра по category_name И для cat_names.
    cats_task = inventree.list_categories()
    cat_names_task = inventree.category_name_map()
    search_task = inventree.search_parts(search=q, category=category)
    stock_task = inventree.list_stock()
    listings_task = db.execute(
        select(Listing)
        .options(selectinload(Listing.seller))
        .where(Listing.status == ListingStatus.active)
        .order_by(Listing.price_rub.asc())
    )

    results = await asyncio.gather(
        search_task,
        cats_task,
        cat_names_task,
        stock_task,
        listings_task,
        return_exceptions=True,
    )
    parts = results[0] if not isinstance(results[0], BaseException) else []
    cats = results[1] if not isinstance(results[1], BaseException) else []
    cat_names = results[2] if not isinstance(results[2], BaseException) else {}
    stock_parts = {s["part"] for s in (results[3] if not isinstance(results[3], BaseException) else [])}
    listing_rows = (results[4] if not isinstance(results[4], BaseException) else []).scalars().all()

    # Поиск "типа" (категории) по имени: собираем категории, начинающиеся/содержащие имя
    if category_name:
        match_ids = {
            c["pk"] for c in cats if category_name.lower() in (c.get("name") or "").lower()
        }
        parts = [p for p in parts if p.get("category") in match_ids]

    # Фильтр по бренду/модели: если запрошены и по ним ничего не нашлось — пустой каталог
    if brand_model_parts is not None:
        if not brand_model_parts:
            return []
        parts = [p for p in parts if int(p.get("pk", 0)) in brand_model_parts]

    # лучший (самый дешёвый) активный листинг по каждой части
    listing_by_part: dict[int | None, Listing | None] = {}
    for l in listing_rows:
        if l.inventree_part_id is not None and l.inventree_part_id not in listing_by_part:
            listing_by_part[l.inventree_part_id] = l

    items: list[CatalogItem] = []
    for p in parts:
        pid = p.get("pk")
        if pid is None:
            continue
        pid = int(pid)
        in_stock = pid in stock_parts
        if only_stock and not in_stock:
            continue
        listing = listing_by_part.get(pid)
        if status is not None and (listing is None or listing.status != status):
            # фильтр по статусу листинга: без активного листинга деталь не показываем
            continue
        raw_cat = p.get("category")
        cat_name = ""
        if isinstance(raw_cat, int):
            cat_name = cat_names.get(raw_cat, "")
        price = listing.price_rub if listing else None
        if price_from is not None and (price is None or price < price_from):
            continue
        if price_to is not None and (price is None or price > price_to):
            continue
        seller = listing.seller if listing else None
        listing_cond = listing.condition.value if listing else None
        items.append(
            CatalogItem(
                id=pid,
                name=p.get("name") or "",
                category=cat_name,
                is_assembly=bool(p.get("assembly")),
                in_stock=in_stock,
                listing_price=listing.price_rub if listing else None,
                listing_status=listing.status.value if listing else None,
                listing_condition=listing_cond,
                listing_provenance=listing.provenance if listing else None,
                listing_warranty=_warranty(listing_cond),
                listing_id=listing.id if listing else None,
                seller_name=seller.name if seller else None,
                seller_rating=seller.rating if seller else None,
                seller_verified=seller.verified if seller else None,
            )
        )

    # сортировка
    if sort == "price_asc":
        items.sort(key=lambda i: (i.listing_price is None, i.listing_price or float("inf")))
    elif sort == "price_desc":
        items.sort(key=lambda i: (i.listing_price is None, -(i.listing_price or 0)))
    elif sort == "name":
        items.sort(key=lambda i: i.name.lower())
    return items


@router.get("/catalog/{part_id}", response_model=CatalogDetail)
async def catalog_detail(
    part_id: int,
    db: AsyncSession = Depends(get_db),
) -> CatalogDetail:
    """Карточка детали: сама Part из InvenTree + все активные листинги + рейтинг продавца."""
    try:
        part = await inventree.get_part(part_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Деталь не найдена в InvenTree") from exc

    cat_names = await inventree.category_name_map()
    raw_cat = part.get("category")
    cat_name = ""
    if isinstance(raw_cat, int):
        cat_name = cat_names.get(raw_cat, "")

    stock_parts = {s["part"] for s in await inventree.list_stock()}

    listings = (
        await db.execute(
            select(Listing)
            .options(selectinload(Listing.seller))
            .where(Listing.inventree_part_id == part_id)
            .order_by(Listing.price_rub.asc())
        )
    ).scalars().all()
    active = [l for l in listings if l.status == ListingStatus.active]

    listing_outs: list[CatalogListingOut] = []
    min_price = None
    min_condition = None
    # UX-2: показываем ВСЕ листинги (active/negotiated/sold) — проданные видны
    # на карточке со статусом "sold". min_price/min_condition — только по active.
    for l in listings:
        seller = l.seller
        listing_outs.append(
            CatalogListingOut(
                id=l.id,
                title=l.title,
                price_rub=l.price_rub,
                condition=l.condition.value,
                provenance=l.provenance,
                warranty=_warranty(l.condition.value),
                status=l.status.value,
                seller_name=seller.name if seller else None,
                seller_rating=seller.rating if seller else None,
                seller_verified=seller.verified if seller else None,
            )
        )
        if l.status == ListingStatus.active:
            if min_price is None or l.price_rub < min_price:
                min_price = l.price_rub
                min_condition = l.condition.value

    return CatalogDetail(
        id=part_id,
        name=part.get("name") or f"Деталь #{part_id}",
        category=cat_name,
        is_assembly=bool(part.get("assembly")),
        in_stock=part_id in stock_parts,
        description=part.get("description") or part.get("name") or "",
        image_url=part.get("image") or None,
        listings=listing_outs,
        min_price=min_price,
        min_condition=min_condition,
    )


@router.get("/donor/{donor_part_id}", response_model=DonorSchema)
async def get_donor(donor_part_id: int, db: AsyncSession = Depends(get_db)) -> DonorSchema:
    """Развёртка донора: components по BOM InvenTree + цены/статусы с наших листингов."""
    try:
        donor = await inventree.get_part(donor_part_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Донор не найден в InvenTree") from exc

    bom_subs = await inventree.get_bom_subs(donor_part_id)

    # активные листинги по part_id
    listing_by_part = {
        l.inventree_part_id: l
        for l in (await db.execute(select(Listing))).scalars().all()
        if l.inventree_part_id is not None
    }

    # слот ↔ label компонента (чтобы мапить листинги по части, а не по названию)
    components: list[DonorComponent] = []
    for comp in bom_subs:
        part_id = comp["part_id"]
        listing = listing_by_part.get(part_id)
        components.append(
            DonorComponent(
                slot=comp["name"],
                title=comp["name"],
                part_id=part_id,
                price_rub=listing.price_rub if listing else 0,
                status=listing.status.value if listing else "none",
                hotspot={},
                image=comp.get("image") or None,
            )
        )

    return DonorSchema(
        brand=donor.get("category_detail", {}).get("name", "") if donor.get("category_detail") else "",
        model=donor.get("name", str(donor_part_id)),
        exploded_view_url=donor.get("image") or "",
        components=components,
    )


# ============================== DONOR LOTS (S1) ==============================


async def _load_donor_lot(db: AsyncSession, lot_id: uuid.UUID) -> DonorLot | None:
    """Донор-лот с предзагруженными связями (device_schema, seller).

    Ленивое обращение к связи в async-сессии падает MissingGreenlet -> HTTP 500,
    поэтому связи всегда грузим заранее через selectinload.
    """
    stmt = (
        select(DonorLot)
        .options(selectinload(DonorLot.device_schema), selectinload(DonorLot.seller))
        .where(DonorLot.id == lot_id)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


@router.get("/donor-lots", response_model=list[DonorLotOut])
async def list_donor_lots(
    status: ListingStatus | None = Query(default=None),
    brand: str | None = Query(default=None),
    model: str | None = Query(default=None),
    only_available: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> list[DonorLotOut]:
    """Список донор-комплектов с фильтрами."""
    stmt = select(DonorLot).options(
        selectinload(DonorLot.seller),
        selectinload(DonorLot.device_schema),
    )
    if status is not None:
        stmt = stmt.where(DonorLot.status == status)
    if only_available:
        stmt = stmt.where(DonorLot.status == ListingStatus.active)
    if brand:
        stmt = stmt.join(DeviceSchema).where(DeviceSchema.brand.ilike(f"%{brand}%"))
    if model:
        stmt = stmt.join(DeviceSchema).where(DeviceSchema.model.ilike(f"%{model}%"))
    records = list((await db.execute(stmt)).scalars().all())
    out: list[DonorLotOut] = []
    for lot in records:
        component_count = 0
        if lot.device_schema and lot.device_schema.inventree_donor_part_id:
            try:
                bom = await inventree.get_bom_subs(lot.device_schema.inventree_donor_part_id)
                component_count = len(bom) if isinstance(bom, list) else 0
            except Exception:
                component_count = 0
        listing_id = None
        listing_res = await db.execute(select(Listing).where(Listing.donor_lot_id == lot.id))
        listing = listing_res.scalar_one_or_none()
        if listing:
            listing_id = listing.id
        seller_name = lot.seller.name if lot.seller else None
        seller_rating = lot.seller.rating if lot.seller else None
        seller_verified = lot.seller.verified if lot.seller else None
        out.append(DonorLotOut(
            id=lot.id,
            device_schema_id=lot.device_schema_id,
            brand=lot.device_schema.brand if lot.device_schema else "",
            model=lot.device_schema.model if lot.device_schema else "",
            donor_part_id=lot.device_schema.inventree_donor_part_id if lot.device_schema else None,
            title=lot.title,
            price_rub=lot.price_rub,
            condition=lot.condition,
            provenance=lot.provenance,
            status=lot.status,
            seller_name=seller_name,
            seller_rating=seller_rating,
            seller_verified=seller_verified,
            component_count=component_count,
            listing_id=listing_id,
            created_at=lot.created_at,
        ))
    return out


@router.get("/donor-lots/{id}", response_model=DonorLotDetail)
async def get_donor_lot(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(optional_user),
) -> DonorLotDetail:
    """Карточка донор-комплекта с развёрткой."""
    lot = await _load_donor_lot(db, id)
    if lot is None:
        raise HTTPException(status_code=404, detail="Donor lot not found")
    components: list[DonorComponent] = []
    if lot.device_schema and lot.device_schema.inventree_donor_part_id:
        try:
            bom_subs = await inventree.get_bom_subs(lot.device_schema.inventree_donor_part_id)
            # Загружаем изображения компонентов из InvenTree
            for comp in bom_subs:
                part_id = comp["part_id"]
                try:
                    part_data = await inventree.get_part(part_id)
                    comp["image"] = part_data.get("image") or None
                except Exception:
                    comp["image"] = None
            listing_by_part = {
                l.inventree_part_id: l
                for l in (await db.execute(select(Listing))).scalars().all()
                if l.inventree_part_id is not None
            }
            for comp in bom_subs:
                part_id = comp["part_id"]
                listing = listing_by_part.get(part_id)
                components.append(DonorComponent(
                    slot=comp["name"],
                    title=comp["name"],
                    part_id=part_id,
                    price_rub=listing.price_rub if listing else 0,
                    status=listing.status.value if listing else "none",
                    hotspot={},
                    image=comp.get("image"),
                ))
        except Exception as exc:
            # Развёртка не должна ронять карточку, но ошибку логируем — иначе
            # она уходит в молчаливый pass и компоненты остаются пустыми.
            log.warning("donor lot %s: не удалось собрать развёртку: %r", id, exc, exc_info=True)
    if lot.device_schema and lot.device_schema.hotspots:
        for c in components:
            hs = lot.device_schema.hotspots.get(c.slot)
            if hs:
                c.hotspot = hs
    requests_out = None
    if user and user.role in (UserRole.seller, UserRole.admin) and user.company_id == lot.seller_id:
        reqs = await db.execute(select(DonorRequest).where(DonorRequest.donor_lot_id == id))
        reqs_list = reqs.scalars().all()
        requests_out = []
        for r in reqs_list:
            buyer = await db.get(Company, r.buyer_company_id)
            requests_out.append(DonorRequestOut(
                id=r.id,
                donor_lot_id=r.donor_lot_id,
                buyer_company_id=r.buyer_company_id,
                seller_company_id=r.seller_company_id,
                amount_rub=r.amount_rub,
                message=r.message,
                status=r.status,
                created_at=r.created_at,
                buyer_name=buyer.name if buyer else None,
            ))
    listing_id = None
    listing_res = await db.execute(select(Listing).where(Listing.donor_lot_id == id))
    listing = listing_res.scalar_one_or_none()
    if listing:
        listing_id = listing.id
    # Изображение донора из InvenTree
    donor_image = None
    if lot.device_schema and lot.device_schema.inventree_donor_part_id:
        try:
            donor_part_data = await inventree.get_part(lot.device_schema.inventree_donor_part_id)
            donor_image = donor_part_data.get("image") or None
        except Exception:
            pass
    return DonorLotDetail(
        id=lot.id,
        device_schema_id=lot.device_schema_id,
        brand=lot.device_schema.brand if lot.device_schema else "",
        model=lot.device_schema.model if lot.device_schema else "",
        donor_part_id=lot.device_schema.inventree_donor_part_id if lot.device_schema else None,
        title=lot.title,
        price_rub=lot.price_rub,
        condition=lot.condition,
        provenance=lot.provenance,
        status=lot.status,
        seller_name=lot.seller.name if lot.seller else None,
        seller_rating=lot.seller.rating if lot.seller else None,
        seller_verified=lot.seller.verified if lot.seller else None,
        component_count=len(components),
        listing_id=listing_id,
        created_at=lot.created_at,
        exploded_url=lot.device_schema.exploded_view_url if lot.device_schema else "",
        donor_image=donor_image,
        components=components,
        requests=requests_out,
    )


@router.post("/donor-lots", response_model=DonorLotOut, status_code=201)
async def create_donor_lot(
    payload: DonorLotIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.admin)),
) -> DonorLot:
    if user.company_id is None:
        raise HTTPException(status_code=403, detail="У пользователя нет компании")
    schema = await db.get(DeviceSchema, payload.device_schema_id)
    if schema is None:
        raise HTTPException(status_code=400, detail="DeviceSchema not found")
    record = DonorLot(
        device_schema_id=payload.device_schema_id,
        seller_id=user.company_id,
        title=payload.title,
        price_rub=payload.price_rub,
        condition=payload.condition,
        provenance=payload.provenance,
        status=ListingStatus.active,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.post("/donor-lots/{id}/request", response_model=DonorRequestOut, status_code=201)
async def create_donor_request(
    id: uuid.UUID,
    payload: DonorRequestIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> DonorRequestOut:
    lot = await _load_donor_lot(db, id)
    if lot is None:
        raise HTTPException(status_code=404, detail="Donor lot not found")
    if lot.status == ListingStatus.sold:
        raise HTTPException(status_code=400, detail="Донор уже продан")
    if user.company_id is None:
        raise HTTPException(status_code=400, detail="У пользователя нет компании")
    buyer = await db.get(Company, user.company_id)
    if buyer is None:
        raise HTTPException(status_code=400, detail="buyer_company_id: Company not found")
    req = DonorRequest(
        donor_lot_id=id,
        buyer_company_id=user.company_id,
        seller_company_id=lot.seller_id,
        amount_rub=payload.amount_rub,
        message=payload.message,
        status="pending",
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    buyer_name = buyer.name if buyer else None
    return DonorRequestOut(
        id=req.id,
        donor_lot_id=req.donor_lot_id,
        buyer_company_id=req.buyer_company_id,
        seller_company_id=req.seller_company_id,
        amount_rub=req.amount_rub,
        message=req.message,
        status=req.status,
        created_at=req.created_at,
        buyer_name=buyer_name,
    )


@router.get("/donor-lots/{id}/requests", response_model=list[DonorRequestOut])
async def list_donor_requests(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.admin)),
) -> list[DonorRequestOut]:
    lot = await _load_donor_lot(db, id)
    if lot is None:
        raise HTTPException(status_code=404, detail="Donor lot not found")
    if user.company_id != lot.seller_id and user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="No access")
    reqs = await db.execute(select(DonorRequest).where(DonorRequest.donor_lot_id == id))
    out: list[DonorRequestOut] = []
    for r in reqs.scalars().all():
        buyer = await db.get(Company, r.buyer_company_id)
        out.append(DonorRequestOut(
            id=r.id,
            donor_lot_id=r.donor_lot_id,
            buyer_company_id=r.buyer_company_id,
            seller_company_id=r.seller_company_id,
            amount_rub=r.amount_rub,
            message=r.message,
            status=r.status,
            created_at=r.created_at,
            buyer_name=buyer.name if buyer else None,
        ))
    return out


@router.post("/donor-lots/{id}/deals", response_model=OneClickDealOut, status_code=201)
async def donor_lot_deal(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> OneClickDealOut:
    if user.company_id is None:
        raise HTTPException(status_code=400, detail="У пользователя нет компании")
    company = await db.get(Company, user.company_id)
    if company is None:
        raise HTTPException(status_code=400, detail="У пользователя нет компании")
    if not company.verified:
        raise HTTPException(status_code=403, detail="Аккаунт не верифицирован — покупка целиком недоступна")
    lot = await _load_donor_lot(db, id)
    if lot is None:
        raise HTTPException(status_code=404, detail="Donor lot not found")
    if lot.status == ListingStatus.sold:
        raise HTTPException(status_code=400, detail="Донор уже продан")
    profile = await db.execute(select(BuyerProfile).where(BuyerProfile.company_id == company.id))
    profile = profile.scalar_one_or_none()
    if profile is None or not profile.billing_payer_name or not profile.billing_inn or not profile.default_address:
        raise HTTPException(status_code=400, detail="Заполните реквизиты плательщика (наименование, ИНН) и адрес доставки для покупки целиком")
    listing_res = await db.execute(select(Listing).where(Listing.donor_lot_id == id))
    whole_listing = listing_res.scalar_one_or_none()
    if whole_listing is None:
        whole_listing = Listing(
            inventree_part_id=(
                lot.device_schema.inventree_donor_part_id if lot.device_schema else None
            ),
            donor_lot_id=lot.id,
            seller_id=lot.seller_id,
            device_schema_id=lot.device_schema_id,
            title=lot.title,
            price_rub=lot.price_rub,
            condition=lot.condition,
            provenance=lot.provenance,
            status=ListingStatus.active,
        )
        db.add(whole_listing)
        await db.flush()
    seller_company_id = lot.seller_id
    amount = lot.price_rub
    deal = Deal(
        listing_id=whole_listing.id,
        buyer_company_id=company.id,
        seller_company_id=seller_company_id,
        status=DealStatus.created,
        amount_rub=amount,
        yookassa_payment_id=None,
        escrow_status="created",
        shipping_address=profile.default_address,
        transitions=[],
    )
    db.add(deal)
    await db.flush()
    payment_id = new_payment_id()
    payment = yookassa.create_safe_deal_payment(
        amount_rub=amount,
        deal_id=str(deal.id),
        payment_id=payment_id,
        return_url="https://partsdonor.local/pay/success",
    )
    deal.yookassa_payment_id = payment.get("id") or payment_id
    whole_listing.status = ListingStatus.negotiated
    lot.status = ListingStatus.negotiated
    await db.commit()
    await db.refresh(deal)
    pay_out = DealPayOut(
        payment_id=deal.yookassa_payment_id or payment_id,
        deal_id=deal.id,
        status=payment.get("status", "pending"),
        confirmation_url=payment.get("confirmation", {}).get("confirmation_url") if isinstance(payment.get("confirmation"), dict) else None,
        test=bool(payment.get("test", yookassa.test_mode)),
    )
    return OneClickDealOut(
        deal=deal,
        payment=pay_out,
        billing_payer_name=profile.billing_payer_name,
        billing_inn=profile.billing_inn,
        delivery_address=profile.default_address,
    )


# ============================== COMPANIES ==============================


@router.get("/companies", response_model=list[CompanyOut])
async def list_companies(db: AsyncSession = Depends(get_db)) -> list[Company]:
    return list((await db.execute(select(Company).order_by(Company.created_at.desc()))).scalars().all())


@router.post("/companies", response_model=CompanyOut, status_code=201)
async def create_company(payload: CompanyIn, db: AsyncSession = Depends(get_db)) -> Company:
    record = Company(**payload.model_dump())
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.get("/companies/{company_id}", response_model=CompanyOut)
async def get_company(company_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Company:
    record = await db.get(Company, company_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return record


# ============================== DEVICE SCHEMAS ==============================


@router.get("/device-schemas", response_model=list[DeviceSchemaOut])
async def list_device_schemas(db: AsyncSession = Depends(get_db)) -> list[DeviceSchema]:
    return list((await db.execute(select(DeviceSchema).order_by(DeviceSchema.created_at.desc()))).scalars().all())


@router.post("/device-schemas", response_model=DeviceSchemaOut, status_code=201)
async def create_device_schema(
    payload: DeviceSchemaIn, db: AsyncSession = Depends(get_db)
) -> DeviceSchema:
    record = DeviceSchema(
        brand=payload.brand,
        model=payload.model,
        inventree_donor_part_id=payload.inventree_donor_part_id,
        exploded_view_url=payload.exploded_view_url,
        hotspots={k: v.model_dump() for k, v in payload.hotspots.items()},
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.get("/device-schemas/{schema_id}", response_model=DeviceSchemaOut)
async def get_device_schema(schema_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> DeviceSchema:
    record = await db.get(DeviceSchema, schema_id)
    if record is None:
        raise HTTPException(status_code=404, detail="DeviceSchema not found")
    return record


# ============================== LISTINGS ==============================


@router.get("/listings", response_model=list[ListingOut])
async def list_listings(
    status: ListingStatus | None = None,
    seller_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[Listing]:
    stmt = select(Listing).order_by(Listing.created_at.desc())
    if status is not None:
        stmt = stmt.where(Listing.status == status)
    if seller_id is not None:
        stmt = stmt.where(Listing.seller_id == seller_id)
    records = list((await db.execute(stmt)).scalars().all())
    for record in records:
        record.part_name, record.part_category = await _part_info(record.inventree_part_id)
    return records


@router.post("/listings", response_model=ListingOut, status_code=201)
async def create_listing(
    payload: ListingIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.admin)),
) -> Listing:
    # seller привязываем к компании аутентифицированного пользователя —
    # seller_id из тела не доверяем
    data = payload.model_dump(exclude={"seller_id"})
    if user.company_id is None:
        raise HTTPException(status_code=403, detail="У пользователя нет компании (мастерской)")
    data["seller_id"] = user.company_id
    if data.get("inventree_part_id"):
        try:
            await inventree.get_part(data["inventree_part_id"])
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=400,
                detail=f"inventree_part_id: деталь {data['inventree_part_id']} не найдена в InvenTree",
            ) from exc
    if data.get("inventree_stock_id"):
        try:
            await inventree.request("GET", f"stock/{data['inventree_stock_id']}/")
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=400,
                detail=f"inventree_stock_id: сток {data['inventree_stock_id']} не найден в InvenTree",
            ) from exc
    record = Listing(**data)
    db.add(record)
    await db.commit()
    await db.refresh(record)
    record.part_name, record.part_category = await _part_info(record.inventree_part_id)

    # UX-2: новый активный листинг -> уведомляем подписчиков этой части.
    # Сбой подписки никогда не должен ломать создание листинга.
    if record.inventree_part_id is not None and record.status == ListingStatus.active:
        try:
            subs = (
                await db.execute(
                    select(ListingSubscription).where(
                        ListingSubscription.inventree_part_id == record.inventree_part_id,
                        ListingSubscription.notified == False,  # noqa: E712
                    )
                )
            ).scalars().all()
            for s in subs:
                s.notified = True
                s.notified_at = datetime.now(timezone.utc)
            if subs:
                await db.commit()
        except Exception as exc:  # noqa: BLE001
            log.warning("subscription notify failed for part %s: %s", record.inventree_part_id, exc)
    return record


@router.get("/listings/{listing_id}", response_model=ListingOut)
async def get_listing(listing_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Listing:
    record = await db.get(Listing, listing_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    record.part_name, record.part_category = await _part_info(record.inventree_part_id)
    return record


@router.patch("/listings/{listing_id}", response_model=ListingOut)
async def update_listing(
    listing_id: uuid.UUID,
    payload: ListingUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.admin)),
) -> Listing:
    record = await db.get(Listing, listing_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    # владение: seller редактирует только свои листинги (admin — любые)
    if user.role != UserRole.admin and record.seller_id != user.company_id:
        raise HTTPException(status_code=403, detail="Нет доступа к этому листингу")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(record, k, v)
    await db.commit()
    await db.refresh(record)
    record.part_name, record.part_category = await _part_info(record.inventree_part_id)
    return record


# ============================== DEALS (статусная машина + escrow) ==============================


@router.post("/deals", response_model=DealOut, status_code=201)
async def create_deal(payload: DealCreateIn, db: AsyncSession = Depends(get_db)) -> Deal:
    """Создание сделки по listing'у. Стартовый статус created, escrow — готов для ЮKassa."""
    listing = await db.get(Listing, payload.listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.status == ListingStatus.sold:
        raise HTTPException(status_code=400, detail="Товар уже продан")

    buyer = await db.get(Company, payload.buyer_company_id)
    if buyer is None:
        raise HTTPException(status_code=400, detail="buyer_company_id: Company не найден")

    seller_company_id = payload.seller_company_id or listing.seller_id
    if seller_company_id is not None:
        seller = await db.get(Company, seller_company_id)
        if seller is None:
            raise HTTPException(status_code=400, detail="seller_company_id: Company не найден")

    amount = payload.amount_rub or listing.price_rub
    deal = Deal(
        listing_id=listing.id,
        buyer_company_id=buyer.id,
        seller_company_id=seller_company_id,
        status=DealStatus.created,
        amount_rub=amount,
        yookassa_payment_id=payload.yookassa_payment_id,
        escrow_status="created",
        shipping_address=payload.shipping_address,
        transitions=[],
    )
    db.add(deal)
    # Листинг уходит в переговоры
    listing.status = ListingStatus.negotiated
    await db.commit()
    await db.refresh(deal)
    return deal


@router.get("/deals", response_model=list[DealOut])
async def list_deals(
    status: DealStatus | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[Deal]:
    stmt = select(Deal).order_by(Deal.created_at.desc())
    if status is not None:
        stmt = stmt.where(Deal.status == status)
    return list((await db.execute(stmt)).scalars().all())


@router.get("/deals/{deal_id}", response_model=DealOut)
async def get_deal(deal_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Deal:
    record = await db.get(Deal, deal_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    return record


@router.post("/deals/{deal_id}/transition", response_model=DealTransitionOut)
async def transition_deal(
    deal_id: uuid.UUID,
    payload: DealTransitionIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.buyer, UserRole.admin)),
) -> DealTransitionOut:
    """Перевод сделки по статусной машине; escrow-статус обновляется автоматически."""
    record = await db.get(Deal, deal_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    # владение: seller/buyer работают только со своими сделками (admin — любые)
    if user.role != UserRole.admin:
        my_company = user.company_id
        if my_company not in (record.seller_company_id, record.buyer_company_id):
            raise HTTPException(status_code=403, detail="Нет доступа к этой сделке")

    from_status = record.status
    if payload.from_status is not None and payload.from_status != from_status:
        raise HTTPException(
            status_code=409,
            detail=f"Ожидался статус {payload.from_status.value}, фактический {from_status.value}",
        )
    try:
        validate_transition(from_status, payload.to)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    record.status = payload.to
    record.escrow_status = ESCROW_BY_DEAL[payload.to]
    history = list(record.transitions or [])
    history.append(
        {
            "from": from_status.value,
            "to": payload.to.value,
            "at": datetime.now(timezone.utc).isoformat(),
        }
    )
    record.transitions = history
    await db.commit()
    await db.refresh(record)
    return DealTransitionOut(
        from_status=from_status,
        to_status=payload.to,
        ok=True,
        deal=record,
    )


# ============================== ПОКУПКА В 1 КЛИК (UX-1) ==============================


@router.get("/buyer-profile", response_model=BuyerProfileOut)
async def get_buyer_profile(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> BuyerProfile:
    """Профиль покупателя (реквизиты плательщика + адрес по умолчанию)."""
    if user.company_id is None:
        raise HTTPException(status_code=404, detail="Профиль покупателя не заполнен")
    profile = (
        await db.execute(select(BuyerProfile).where(BuyerProfile.company_id == user.company_id))
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Профиль покупателя не заполнен")
    return profile


@router.put("/buyer-profile", response_model=BuyerProfileOut)
async def upsert_buyer_profile(
    payload: BuyerProfileIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> BuyerProfile:
    """Сохранить/обновить реквизиты плательщика и адрес доставки по умолчанию."""
    if user.company_id is None:
        raise HTTPException(status_code=400, detail="У пользователя нет компании")
    company = await db.get(Company, user.company_id)
    if company is None:
        raise HTTPException(status_code=400, detail="У пользователя нет компании")
    profile = (
        await db.execute(select(BuyerProfile).where(BuyerProfile.company_id == company.id))
    ).scalar_one_or_none()
    if profile is None:
        profile = BuyerProfile(company_id=company.id)
    profile.billing_payer_name = payload.billing_payer_name
    profile.billing_inn = payload.billing_inn
    profile.default_address = payload.default_address
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/deals/one-click", response_model=OneClickDealOut, status_code=201)
async def one_click_deal(
    payload: OneClickDealIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> OneClickDealOut:
    """Создать сделку (эскроу) одним действием, используя сохранённые
    реквизиты плательщика и адрес доставки по умолчанию. Только для
    верифицированных компаний-покупателей."""
    if user.company_id is None:
        raise HTTPException(status_code=400, detail="У пользователя нет компании")
    company = await db.get(Company, user.company_id)
    if company is None:
        raise HTTPException(status_code=400, detail="У пользователя нет компании")
    if not company.verified:
        raise HTTPException(
            status_code=403,
            detail="Аккаунт не верифицирован — покупка в 1 клик недоступна",
        )

    listing = await db.get(Listing, payload.listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.status == ListingStatus.sold:
        raise HTTPException(status_code=400, detail="Товар уже продан")

    profile = (
        await db.execute(select(BuyerProfile).where(BuyerProfile.company_id == company.id))
    ).scalar_one_or_none()
    if (
        profile is None
        or not profile.billing_payer_name
        or not profile.billing_inn
        or not profile.default_address
    ):
        raise HTTPException(
            status_code=400,
            detail="Заполните реквизиты плательщика (наименование, ИНН) и адрес доставки для покупки в 1 клик",
        )

    seller_company_id = listing.seller_id
    amount = listing.price_rub
    deal = Deal(
        listing_id=listing.id,
        buyer_company_id=company.id,
        seller_company_id=seller_company_id,
        status=DealStatus.created,
        amount_rub=amount,
        yookassa_payment_id=None,
        escrow_status="created",
        shipping_address=profile.default_address,
        transitions=[],
    )
    db.add(deal)
    await db.flush()  # нужен deal.id для платежа

    payment_id = new_payment_id()
    payment = yookassa.create_safe_deal_payment(
        amount_rub=amount,
        deal_id=str(deal.id),
        payment_id=payment_id,
        return_url="https://partsdonor.local/pay/success",
    )
    deal.yookassa_payment_id = payment.get("id") or payment_id
    listing.status = ListingStatus.negotiated
    await db.commit()
    await db.refresh(deal)

    pay_out = DealPayOut(
        payment_id=deal.yookassa_payment_id or payment_id,
        deal_id=deal.id,
        status=payment.get("status", "pending"),
        confirmation_url=payment.get("confirmation", {}).get("confirmation_url") if isinstance(
            payment.get("confirmation"), dict
        ) else None,
        test=bool(payment.get("test", yookassa.test_mode)),
    )
    return OneClickDealOut(
        deal=deal,
        payment=pay_out,
        billing_payer_name=profile.billing_payer_name,
        billing_inn=profile.billing_inn,
        delivery_address=profile.default_address,
    )


# ============================== ПОДПИСКИ И УВЕДОМЛЕНИЯ (UX-2) ==============================


@router.get("/subscriptions", response_model=SubscriptionStatusOut)
async def get_subscription(
    part_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> SubscriptionStatusOut:
    """Подписана ли компания пользователя на часть part_id."""
    if user.company_id is None:
        raise HTTPException(status_code=400, detail="У пользователя нет компании")
    exists = (
        await db.execute(
            select(ListingSubscription).where(
                ListingSubscription.company_id == user.company_id,
                ListingSubscription.inventree_part_id == part_id,
            )
        )
    ).scalar_one_or_none()
    return SubscriptionStatusOut(subscribed=exists is not None, part_id=part_id)


@router.post("/subscriptions", response_model=SubscriptionOut, status_code=201)
async def create_subscription(
    payload: SubscriptionIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> ListingSubscription:
    """Подписаться на «Сообщить, когда появится» (одна подписка на company+part)."""
    if user.company_id is None:
        raise HTTPException(status_code=400, detail="У пользователя нет компании")
    sub = (
        await db.execute(
            select(ListingSubscription).where(
                ListingSubscription.company_id == user.company_id,
                ListingSubscription.inventree_part_id == payload.inventree_part_id,
            )
        )
    ).scalar_one_or_none()
    if sub is None:
        sub = ListingSubscription(
            company_id=user.company_id,
            inventree_part_id=payload.inventree_part_id,
            notified=False,
        )
        db.add(sub)
        await db.commit()
        await db.refresh(sub)
    return sub


@router.delete("/subscriptions", response_model=dict)
async def delete_subscription(
    part_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> dict:
    """Отписаться от части part_id."""
    if user.company_id is None:
        raise HTTPException(status_code=400, detail="У пользователя нет компании")
    sub = (
        await db.execute(
            select(ListingSubscription).where(
                ListingSubscription.company_id == user.company_id,
                ListingSubscription.inventree_part_id == part_id,
            )
        )
    ).scalar_one_or_none()
    if sub is not None:
        await db.delete(sub)
        await db.commit()
    return {"ok": True}


@router.get("/notifications", response_model=list[NotificationOut])
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> list[NotificationOut]:
    """Уведомления компании: подписки с notified=True (новые листинги по части)."""
    if user.company_id is None:
        raise HTTPException(status_code=400, detail="У пользователя нет компании")
    subs = (
        await db.execute(
            select(ListingSubscription)
            .where(
                ListingSubscription.company_id == user.company_id,
                ListingSubscription.notified == True,  # noqa: E712
            )
            .order_by(ListingSubscription.notified_at.desc())
        )
    ).scalars().all()
    out: list[NotificationOut] = []
    for s in subs:
        name, _cat = await _part_info(s.inventree_part_id)
        out.append(
            NotificationOut(
                id=s.id,
                inventree_part_id=s.inventree_part_id,
                part_name=name,
                notified_at=s.notified_at,
            )
        )
    return out


# ============================== ЮKASSA (Безопасная сделка) ==============================


@router.post("/deals/{deal_id}/pay", response_model=DealPayOut, status_code=status.HTTP_201_CREATED)
async def deal_pay(
    deal_id: uuid.UUID,
    payload: DealPayIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> DealPayOut:
    """Создать платёж «на холд» в ЮKassa (Безопасная сделка) для сделки.

    В тестовом режиме (нет ключей магазина) возвращаем синтетический объект платежа
    той же формы — чтобы интеграцию можно было прогнать без живого магазина ЮKassa.
    payment_id сохраняем в deal.yookassa_payment_id (по нему потом найдём сделку
    в вебхуке payment.succeeded).
    """
    deal = await db.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    # платит покупатель своей сделки (admin — любой)
    if user.role != UserRole.admin and deal.buyer_company_id != user.company_id:
        raise HTTPException(status_code=403, detail="Нет доступа к этой сделке")
    if deal.status != DealStatus.created:
        raise HTTPException(
            status_code=400,
            detail=f"Платёж можно создать только для сделки в статусе created (сейчас {deal.status.value})",
        )

    payment_id = new_payment_id()
    payment = yookassa.create_safe_deal_payment(
        amount_rub=deal.amount_rub,
        deal_id=str(deal.id),
        payment_id=payment_id,
        return_url=payload.return_url,
    )

    # сохраняем id платежа — по нему вебхук найдёт сделку
    deal.yookassa_payment_id = payment.get("id") or payment_id
    await db.commit()
    await db.refresh(deal)

    return DealPayOut(
        payment_id=deal.yookassa_payment_id or payment_id,
        deal_id=deal.id,
        status=payment.get("status", "pending"),
        confirmation_url=payment.get("confirmation", {}).get("confirmation_url") if isinstance(
            payment.get("confirmation"), dict
        ) else None,
        test=bool(payment.get("test", yookassa.test_mode)),
    )


@router.post("/webhooks/yookassa", response_model=WebhookAck)
async def yookassa_webhook(
    request: Request, db: AsyncSession = Depends(get_db)
) -> WebhookAck:
    """Вебхук ЮKassa: уведомления об изменении статуса платежа/сделки.

    Безопасность:
      1. проверка IP отправителя по подсетям ЮKassa;
      2. проверка HMAC-подписи тела на секрете уведомлений (constant-time).
    Если событие payment.succeeded — переводим сделку created → escrow_paid
    (escrow_status created → paid), находим её по yookassa_payment_id == object.id.
    ЮKassa ждёт HTTP 200; иначе повторяет доставку 24ч.
    """
    client_ip = request.client.host if request.client else None

    # 1. IP-фильтр (подсети ЮKassa)
    if not yookassa.sender_ip_allowed(client_ip):
        log.warning("ЮKassa webhook: IP не из подсетей ЮKassa: %s", client_ip)
        raise HTTPException(status_code=403, detail="IP not allowed")

    # 2. HMAC-подпись тела (X-Signature / заголовок).
    raw_body = await request.body()
    sig = request.headers.get("X-Signature") or request.headers.get("X-Yookassa-Signature")
    if not yookassa.verify_webhook_signature(
        raw_body, sig, settings.yookassa_notification_secret
    ):
        log.warning("ЮKassa webhook: неверная подпись")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        body = await request.json()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc

    event, obj = yookassa.parse_notification(body)
    if event is None:
        raise HTTPException(status_code=400, detail="Not a YooKassa notification")

    processed = False
    if event == "payment.succeeded":
        processed = await _on_payment_succeeded(obj or {}, db)

    return WebhookAck(
        received=True,
        event=event,
        payment_id=obj.get("id") if obj else None,
        processed=processed,
    )


async def _on_payment_succeeded(obj: dict, db: AsyncSession) -> bool:
    """Обработка payment.succeeded: created → escrow_paid + escrow created → paid."""
    pay_id = obj.get("id")
    if not pay_id:
        return False
    deal = (
        await db.execute(select(Deal).where(Deal.yookassa_payment_id == pay_id))
    ).scalar_one_or_none()
    if deal is None:
        log.info("ЮKassa payment.succeeded: сделка по платежу %s не найдена", pay_id)
        return False
    if deal.status != DealStatus.created:
        # уже оплачена/уехала дальше — идемпотентно, повторно не переходим
        log.info("ЮKassa payment.succeeded: сделка %s уже в статусе %s", deal.id, deal.status.value)
        return False

    try:
        validate_transition(deal.status, DealStatus.escrow_paid)
    except ValueError as exc:
        log.warning("ЮKassa payment.succeeded: %s", exc)
        return False

    deal.status = DealStatus.escrow_paid
    deal.escrow_status = ESCROW_BY_DEAL[DealStatus.escrow_paid]  # paid
    history = list(deal.transitions or [])
    history.append(
        {
            "from": DealStatus.created.value,
            "to": DealStatus.escrow_paid.value,
            "at": datetime.now(timezone.utc).isoformat(),
            "source": "yookassa_webhook",
            "payment_id": pay_id,
        }
    )
    deal.transitions = history
    await db.commit()
    log.info("ЮKassa payment.succeeded: сделка %s → escrow_paid", deal.id)
    return True


# ============================== REVIEWS ==============================


@router.get("/companies/{company_id}/rating")
async def company_rating(company_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Средний рейтинг продавца: {seller_id, avg_rating, review_count}."""
    company = await db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")

    stmt = select(func.count(Review.id), func.avg(Review.rating)).where(Review.seller_id == company_id)
    review_count, avg_rating = (await db.execute(stmt)).one()
    return {
        "seller_id": company_id,
        "avg_rating": round(float(avg_rating), 2) if avg_rating is not None else 0.0,
        "review_count": review_count,
    }


@router.get("/reviews", response_model=list[ReviewOut])
async def list_reviews(
    seller_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[Review]:
    stmt = select(Review).order_by(Review.created_at.desc())
    if seller_id is not None:
        stmt = stmt.where(Review.seller_id == seller_id)
    return list((await db.execute(stmt)).scalars().all())


@router.post("/reviews", response_model=ReviewOut, status_code=201)
async def create_review(payload: ReviewIn, db: AsyncSession = Depends(get_db)) -> Review:
    record = Review(
        rating=payload.rating,
        comment=payload.comment,
        seller_id=payload.seller_id,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    # пересчитываем рейтинг продавца (среднее)
    if payload.seller_id:
        seller = await db.get(Company, payload.seller_id)
        if seller is not None:
            rows = (await db.execute(select(Review.rating).where(Review.seller_id == payload.seller_id))).scalars().all()
            if rows:
                seller.rating = round(sum(rows) / len(rows), 2)
                await db.commit()
    return record


# ============================== DONORS / UPLOADS (BE-1) ==============================


def _write_upload(dest: str, content: bytes) -> None:
    with open(dest, "wb") as f:
        f.write(content)


async def _donor_out(db: AsyncSession, donor: Donor) -> DonorOut:
    """Donor -> DonorOut (счётчик частей)."""
    parts = donor.parts if donor.parts is not None else (
        (await db.execute(select(DonorPart).where(DonorPart.donor_id == donor.id))).scalars().all()
    )
    return DonorOut(
        id=donor.id,
        seller_id=donor.seller_id,
        device_schema_id=donor.device_schema_id,
        brand=donor.brand,
        model=donor.model,
        title=donor.title,
        price_rub=donor.price_rub,
        condition=donor.condition,
        provenance=donor.provenance,
        status=donor.status.value if isinstance(donor.status, DonorStatus) else donor.status,
        donor_lot_id=donor.donor_lot_id,
        part_count=len(parts),
        created_at=donor.created_at,
        updated_at=donor.updated_at,
    )


async def _load_donor(db: AsyncSession, donor_id: uuid.UUID) -> Donor | None:
    """Донор с предзагруженными parts и device_schema (избегаем MissingGreenlet)."""
    stmt = (
        select(Donor)
        .options(selectinload(Donor.parts), selectinload(Donor.device_schema))
        .where(Donor.id == donor_id)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


def _assert_donor_owner(user: User, donor: Donor) -> None:
    """Донора может редактировать его продавец или admin."""
    if user.role != UserRole.admin and (not user.company_id or user.company_id != donor.seller_id):
        raise HTTPException(status_code=403, detail="No access to this donor")


@router.get("/donors", response_model=list[DonorOut])
async def list_my_donors(
    donor_status: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.buyer, UserRole.admin)),
) -> list[DonorOut]:
    """Список доноров текущего пользователя (черновики/опубликованные)."""
    stmt = select(Donor).options(selectinload(Donor.parts))
    if user.role != UserRole.admin:
        if not user.company_id:
            return []
        stmt = stmt.where(Donor.seller_id == user.company_id)
    if donor_status:
        stmt = stmt.where(Donor.status == donor_status)
    stmt = stmt.order_by(Donor.updated_at.desc())
    donors = list((await db.execute(stmt)).scalars().all())
    return [await _donor_out(db, d) for d in donors]


@router.post("/donors", response_model=DonorOut, status_code=201)
async def create_donor(
    payload: DonorIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.admin)),
) -> DonorOut:
    """Создание донора (шаг 1 wizard): можно сразу передать состав частей."""
    if user.company_id is None:
        raise HTTPException(status_code=403, detail="У пользователя нет компании")
    schema: DeviceSchema | None = None
    if payload.device_schema_id:
        schema = await db.get(DeviceSchema, payload.device_schema_id)
        if schema is None:
            raise HTTPException(status_code=400, detail="DeviceSchema not found")
    brand = payload.brand or (schema.brand if schema else "")
    model = payload.model or (schema.model if schema else "")
    donor = Donor(
        seller_id=user.company_id,
        device_schema_id=payload.device_schema_id,
        brand=brand,
        model=model,
        title=payload.title,
        price_rub=payload.price_rub,
        condition=payload.condition,
        provenance=payload.provenance,
        status=DonorStatus.draft,
    )
    db.add(donor)
    await db.flush()
    for i, p in enumerate(payload.parts):
        db.add(DonorPart(
            donor_id=donor.id,
            slot=p.slot,
            title=p.title,
            inventree_part_id=p.inventree_part_id,
            price_rub=p.price_rub,
            status=p.status,
            sort=p.sort or i,
        ))
    await db.commit()
    donor = await _load_donor(db, donor.id)
    return await _donor_out(db, donor)


@router.get("/donors/{donor_id}", response_model=DonorDetail)
async def get_donor_detail(
    donor_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.buyer, UserRole.admin)),
) -> DonorDetail:
    """Карточка донора: состав частей + фото."""
    donor = await _load_donor(db, donor_id)
    if donor is None:
        raise HTTPException(status_code=404, detail="Donor not found")
    if user.role != UserRole.admin and (not user.company_id or user.company_id != donor.seller_id):
        raise HTTPException(status_code=403, detail="No access to this donor")
    photos = (
        await db.execute(
            select(Photo).where(Photo.owner_type == "donor", Photo.owner_id == donor.id).order_by(Photo.sort)
        )
    ).scalars().all()
    out = await _donor_out(db, donor)
    return DonorDetail(
        **out.model_dump(),
        parts=[DonorPartOut.model_validate(p) for p in donor.parts],
        photos=[PhotoOut.model_validate(p) for p in photos],
    )


@router.patch("/donors/{donor_id}", response_model=DonorOut)
async def update_donor(
    donor_id: uuid.UUID,
    payload: DonorUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.admin)),
) -> DonorOut:
    donor = await _load_donor(db, donor_id)
    if donor is None:
        raise HTTPException(status_code=404, detail="Donor not found")
    _assert_donor_owner(user, donor)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        if k == "status" and v is not None:
            try:
                donor.status = DonorStatus(v)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Unknown status {v}")
        elif v is not None:
            setattr(donor, k, v)
    await db.commit()
    donor = await _load_donor(db, donor.id)
    return await _donor_out(db, donor)


@router.post("/donors/{donor_id}/parts", response_model=DonorPartOut, status_code=201)
async def add_donor_part(
    donor_id: uuid.UUID,
    payload: DonorPartIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.admin)),
) -> DonorPartOut:
    """Добавить деталь в состав донора (шаг 2-3 wizard: слот/цена/статус)."""
    donor = await _load_donor(db, donor_id)
    if donor is None:
        raise HTTPException(status_code=404, detail="Donor not found")
    _assert_donor_owner(user, donor)
    part = DonorPart(
        donor_id=donor.id,
        slot=payload.slot,
        title=payload.title,
        inventree_part_id=payload.inventree_part_id,
        price_rub=payload.price_rub,
        status=payload.status,
        sort=payload.sort,
    )
    db.add(part)
    await db.commit()
    await db.refresh(part)
    return DonorPartOut.model_validate(part)


@router.patch("/donors/{donor_id}/parts/{part_id}", response_model=DonorPartOut)
async def update_donor_part(
    donor_id: uuid.UUID,
    part_id: uuid.UUID,
    payload: DonorPartIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.admin)),
) -> DonorPartOut:
    donor = await _load_donor(db, donor_id)
    if donor is None:
        raise HTTPException(status_code=404, detail="Donor not found")
    _assert_donor_owner(user, donor)
    part = (
        await db.execute(select(DonorPart).where(DonorPart.id == part_id, DonorPart.donor_id == donor_id))
    ).scalar_one_or_none()
    if part is None:
        raise HTTPException(status_code=404, detail="Donor part not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        if v is not None:
            setattr(part, k, v)
    await db.commit()
    await db.refresh(part)
    return DonorPartOut.model_validate(part)


@router.delete("/donors/{donor_id}/parts/{part_id}", response_model=dict)
async def delete_donor_part(
    donor_id: uuid.UUID,
    part_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.admin)),
) -> dict:
    donor = await _load_donor(db, donor_id)
    if donor is None:
        raise HTTPException(status_code=404, detail="Donor not found")
    _assert_donor_owner(user, donor)
    part = (
        await db.execute(select(DonorPart).where(DonorPart.id == part_id, DonorPart.donor_id == donor_id))
    ).scalar_one_or_none()
    if part is None:
        raise HTTPException(status_code=404, detail="Donor part not found")
    await db.delete(part)
    await db.commit()
    return {"ok": True}


@router.post("/donors/{donor_id}/publish", response_model=DonorPublishOut)
async def publish_donor(
    donor_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.admin)),
) -> DonorPublishOut:
    """Публикация донора: статус -> published и создание DonorLot для витрины (S1-совместимо)."""
    donor = await _load_donor(db, donor_id)
    if donor is None:
        raise HTTPException(status_code=404, detail="Donor not found")
    _assert_donor_owner(user, donor)
    donor_lot_id = donor.donor_lot_id
    created = False
    if donor.status != DonorStatus.published or donor_lot_id is None:
        if not donor.device_schema_id:
            raise HTTPException(status_code=400, detail="Для публикации нужен device_schema_id")
        lot = DonorLot(
            device_schema_id=donor.device_schema_id,
            seller_id=donor.seller_id,
            title=donor.title or f"{donor.brand} {donor.model}".strip(),
            price_rub=donor.price_rub,
            condition=donor.condition,
            provenance=donor.provenance,
            status=ListingStatus.active,
        )
        db.add(lot)
        await db.flush()
        donor_lot_id = lot.id
        donor.donor_lot_id = donor_lot_id
        donor.status = DonorStatus.published
        await db.commit()
        created = True
    donor = await _load_donor(db, donor.id)
    return DonorPublishOut(
        donor=await _donor_out(db, donor),
        donor_lot_id=donor_lot_id,
        message="ok (DonorLot created)" if created else "already published",
    )


@router.post("/uploads", response_model=UploadOut, status_code=201)
async def upload_photo(
    file: UploadFile = File(...),
    owner_type: str = Form(default="donor"),
    owner_id: uuid.UUID | None = Form(default=None),
    sort: int = Form(default=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.admin)),
) -> UploadOut:
    """Загрузка фото: multipart -> disk storage + запись в photos (BE-1).

    owner_type/owner_id — куда привязать фото (опционально; можно привязать позже).
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}:
        ext = ".jpg"
    os.makedirs(settings.upload_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(settings.upload_dir, filename)
    content = await file.read()
    await asyncio.to_thread(_write_upload, dest, content)
    url = f"{settings.upload_url_prefix}/{filename}"
    photo = Photo(owner_type=owner_type, owner_id=owner_id or uuid.uuid4(), url=url, sort=sort)
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return UploadOut(photo=PhotoOut.model_validate(photo), url=url)



# ============================== BUY REQUESTS (BE-2) ==============================


@router.get("/buy-requests", response_model=list[BuyRequestOut])
async def list_buy_requests(
    type: BuyRequestType | None = Query(default=None),
    brand: str | None = Query(default=None),
    status: BuyRequestStatus = Query(default=BuyRequestStatus.open),
    budget_to: float | None = Query(default=None),
    budget_from: float | None = Query(default=None),
    urgent: bool | None = Query(default=None),
    city: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[BuyRequestOut]:
    """Список заявок «Куплю» с фильтрами и пагинацией."""
    stmt = select(BuyRequest).where(BuyRequest.status == status).order_by(BuyRequest.created_at.desc())
    if type is not None:
        stmt = stmt.where(BuyRequest.type == type)
    if brand is not None:
        stmt = stmt.where(BuyRequest.brand.ilike(f"%{brand}%"))
    if budget_to is not None:
        stmt = stmt.where(BuyRequest.budget <= budget_to)
    if budget_from is not None:
        stmt = stmt.where(BuyRequest.budget >= budget_from)
    if urgent is not None:
        stmt = stmt.where(BuyRequest.urgent == urgent)
    if city is not None:
        stmt = stmt.where(BuyRequest.city.ilike(f"%{city}%"))
    records = list((await db.execute(stmt.offset(offset).limit(limit))).scalars().all())

    # Загружаем buyer_name для каждого
    out: list[BuyRequestOut] = []
    for r in records:
        buyer = await db.get(Company, r.buyer_id)
        out.append(BuyRequestOut(
            id=r.id,
            type=r.type,
            brand=r.brand,
            model=r.model,
            cond=r.cond,
            budget=r.budget,
            urgent=r.urgent,
            city=r.city,
            buyer_id=r.buyer_id,
            status=r.status,
            created_at=r.created_at,
            buyer_name=buyer.name if buyer else None,
        ))
    return out


@router.post("/buy-requests", response_model=BuyRequestOut, status_code=201)
async def create_buy_request(
    payload: BuyRequestIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> BuyRequestOut:
    """Создать заявку «Куплю». buyer_id = user.company_id."""
    if user.company_id is None:
        raise HTTPException(status_code=403, detail="У пользователя нет компании")
    record = BuyRequest(
        type=payload.type,
        brand=payload.brand,
        model=payload.model,
        cond=payload.cond,
        budget=payload.budget,
        urgent=payload.urgent or False,
        city=payload.city,
        buyer_id=user.company_id,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    buyer = await db.get(Company, record.buyer_id)
    return BuyRequestOut(
        id=record.id,
        type=record.type,
        brand=record.brand,
        model=record.model,
        cond=record.cond,
        budget=record.budget,
        urgent=record.urgent,
        city=record.city,
        buyer_id=record.buyer_id,
        status=record.status,
        created_at=record.created_at,
        buyer_name=buyer.name if buyer else None,
    )


@router.get("/buy-requests/counters", response_model=BuyCountersOut)
async def buy_request_counters(
    db: AsyncSession = Depends(get_db),
) -> BuyCountersOut:
    """Счётчики заявок по типам, статусам и срочности."""
    # total_open
    total_open = (await db.execute(
        select(func.count()).where(BuyRequest.status == BuyRequestStatus.open)
    )).scalar_one()
    # urgent
    urgent = (await db.execute(
        select(func.count()).where(BuyRequest.urgent == True, BuyRequest.status == BuyRequestStatus.open)  # noqa: E712
    )).scalar_one()
    # by_type
    by_type_rows = (await db.execute(
        select(BuyRequest.type, func.count()).where(BuyRequest.status == BuyRequestStatus.open).group_by(BuyRequest.type)
    )).all()
    by_type = {t.value: c for t, c in by_type_rows}
    # by_status
    by_status_rows = (await db.execute(
        select(BuyRequest.status, func.count()).group_by(BuyRequest.status)
    )).all()
    by_status = {s.value: c for s, c in by_status_rows}
    return BuyCountersOut(total_open=total_open, urgent=urgent, by_type=by_type, by_status=by_status)


@router.get("/buy-requests/{id}", response_model=BuyRequestDetailOut)
async def get_buy_request(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> BuyRequestDetailOut:
    """Деталь заявки + список откликов."""
    record = await db.get(BuyRequest, id)
    if record is None:
        raise HTTPException(status_code=404, detail="Buy request not found")
    responses = await db.execute(select(BuyRequestResponse).where(BuyRequestResponse.buy_request_id == id))
    resp_rows = responses.scalars().all()
    out_responses: list[BuyResponseOut] = []
    for r in resp_rows:
        seller = await db.get(Company, r.seller_id)
        out_responses.append(BuyResponseOut(
            id=r.id,
            buy_request_id=r.buy_request_id,
            seller_id=r.seller_id,
            message=r.message,
            offer_price=r.offer_price,
            status=r.status,
            created_at=r.created_at,
            seller_name=seller.name if seller else None,
        ))
    buyer = await db.get(Company, record.buyer_id)
    return BuyRequestDetailOut(
        id=record.id,
        type=record.type,
        brand=record.brand,
        model=record.model,
        cond=record.cond,
        budget=record.budget,
        urgent=record.urgent,
        city=record.city,
        buyer_id=record.buyer_id,
        status=record.status,
        created_at=record.created_at,
        buyer_name=buyer.name if buyer else None,
        responses=out_responses,
    )


@router.patch("/buy-requests/{id}", response_model=BuyRequestOut)
async def update_buy_request(
    id: uuid.UUID,
    payload: BuyRequestUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> BuyRequestOut:
    """Обновить заявку (только владелец или admin)."""
    record = await db.get(BuyRequest, id)
    if record is None:
        raise HTTPException(status_code=404, detail="Buy request not found")
    if user.role != UserRole.admin and record.buyer_id != user.company_id:
        raise HTTPException(status_code=403, detail="No access")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(record, k, v)
    await db.commit()
    await db.refresh(record)
    buyer = await db.get(Company, record.buyer_id)
    return BuyRequestOut(
        id=record.id,
        type=record.type,
        brand=record.brand,
        model=record.model,
        cond=record.cond,
        budget=record.budget,
        urgent=record.urgent,
        city=record.city,
        buyer_id=record.buyer_id,
        status=record.status,
        created_at=record.created_at,
        buyer_name=buyer.name if buyer else None,
    )


@router.delete("/buy-requests/{id}", response_model=dict)
async def delete_buy_request(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> dict:
    """Удалить заявку + каскадно отклики (только владелец или admin)."""
    record = await db.get(BuyRequest, id)
    if record is None:
        raise HTTPException(status_code=404, detail="Buy request not found")
    if user.role != UserRole.admin and record.buyer_id != user.company_id:
        raise HTTPException(status_code=403, detail="No access")
    await db.delete(record)
    await db.commit()
    return {"ok": True}



@router.get("/buy-requests/me", response_model=list[BuyRequestOut])
async def my_buy_requests(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> list[BuyRequestOut]:
    """Свои заявки текущего пользователя."""
    if user.company_id is None:
        return []
    records = list((await db.execute(
        select(BuyRequest).where(BuyRequest.buyer_id == user.company_id).order_by(BuyRequest.created_at.desc())
    )).scalars().all())
    out: list[BuyRequestOut] = []
    for r in records:
        buyer = await db.get(Company, r.buyer_id)
        out.append(BuyRequestOut(
            id=r.id, type=r.type, brand=r.brand, model=r.model, cond=r.cond,
            budget=r.budget, urgent=r.urgent, city=r.city, buyer_id=r.buyer_id,
            status=r.status, created_at=r.created_at,
            buyer_name=buyer.name if buyer else None,
        ))
    return out


@router.post("/buy-requests/{id}/responses", response_model=BuyResponseOut, status_code=201)
async def create_buy_request_response(
    id: uuid.UUID,
    payload: BuyResponseIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.seller, UserRole.admin)),
) -> BuyResponseOut:
    """Seller responds to a buy request."""
    if user.company_id is None:
        raise HTTPException(status_code=403, detail="У пользователя нет компании")
    br = await db.get(BuyRequest, id)
    if br is None:
        raise HTTPException(status_code=404, detail="Buy request not found")
    if br.status != BuyRequestStatus.open:
        raise HTTPException(status_code=409, detail="заявка закрыта")
    record = BuyRequestResponse(
        buy_request_id=id,
        seller_id=user.company_id,
        message=payload.message,
        offer_price=payload.offer_price,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    seller = await db.get(Company, record.seller_id)
    return BuyResponseOut(
        id=record.id,
        buy_request_id=record.buy_request_id,
        seller_id=record.seller_id,
        message=record.message,
        offer_price=record.offer_price,
        status=record.status,
        created_at=record.created_at,
        seller_name=seller.name if seller else None,
    )


@router.get("/buy-requests/{id}/responses", response_model=list[BuyResponseOut])
async def list_buy_request_responses(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[BuyResponseOut]:
    """Список откликов заявки (владелец запроса, seller или admin)."""
    br = await db.get(BuyRequest, id)
    if br is None:
        raise HTTPException(status_code=404, detail="Buy request not found")
    if user.role != UserRole.admin:
        is_owner = user.company_id == br.buyer_id
        is_seller = False
        if not is_owner:
            resp = await db.execute(select(BuyRequestResponse).where(
                BuyRequestResponse.buy_request_id == id,
                BuyRequestResponse.seller_id == user.company_id
            ))
            is_seller = resp.scalar_one_or_none() is not None
        if not is_owner and not is_seller:
            raise HTTPException(status_code=403, detail="No access")
    responses = await db.execute(select(BuyRequestResponse).where(BuyRequestResponse.buy_request_id == id))
    resp_rows = responses.scalars().all()
    out: list[BuyResponseOut] = []
    for r in resp_rows:
        seller = await db.get(Company, r.seller_id)
        out.append(BuyResponseOut(
            id=r.id, buy_request_id=r.buy_request_id, seller_id=r.seller_id,
            message=r.message, offer_price=r.offer_price, status=r.status,
            created_at=r.created_at, seller_name=seller.name if seller else None,
        ))
    return out


@router.patch("/buy-requests/{id}/responses/{rid}", response_model=BuyResponseOut)
async def accept_buy_request_response(
    id: uuid.UUID,
    rid: uuid.UUID,
    payload: BuyResponseIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.admin)),
) -> BuyResponseOut:
    """Принять или отклонить отклик. При принятии — auto-accept request, reject other pending."""
    if user.company_id is None:
        raise HTTPException(status_code=403, detail="У пользователя нет компании")
    br = await db.get(BuyRequest, id)
    if br is None:
        raise HTTPException(status_code=404, detail="Buy request not found")
    if user.role != UserRole.admin and br.buyer_id != user.company_id:
        raise HTTPException(status_code=403, detail="No access")
    resp = await db.get(BuyRequestResponse, rid)
    if resp is None or resp.buy_request_id != id:
        raise HTTPException(status_code=404, detail="Response not found")
    new_status = payload.status if hasattr(payload, 'status') else None
    # Determine status from request body
    data = payload.model_dump(exclude_none=True)
    resp_status = data.get("status")
    if resp_status is None:
        raise HTTPException(status_code=400, detail="status required (accepted|rejected)")
    if resp_status not in ("accepted", "rejected"):
        raise HTTPException(status_code=400, detail="status must be accepted or rejected")
    resp.status = BuyResponseStatus(resp_status)
    if resp_status == "accepted":
        br.status = BuyRequestStatus.accepted
        # auto-reject all other pending responses
        others = await db.execute(select(BuyRequestResponse).where(
            BuyRequestResponse.buy_request_id == id,
            BuyRequestResponse.id != rid,
            BuyRequestResponse.status == BuyResponseStatus.pending
        ))
        for other in others.scalars().all():
            other.status = BuyResponseStatus.rejected
    await db.commit()
    await db.refresh(resp)
    seller = await db.get(Company, resp.seller_id)
    return BuyResponseOut(
        id=resp.id,
        buy_request_id=resp.buy_request_id,
        seller_id=resp.seller_id,
        message=resp.message,
        offer_price=resp.offer_price,
        status=resp.status,
        created_at=resp.created_at,
        seller_name=seller.name if seller else None,
    )



app.include_router(router)
app.include_router(auth_router)
app.include_router(admin_router)

# BE-1: отдача загруженных фото (static). POST /uploads — на router, GET — статика.
os.makedirs(settings.upload_dir, exist_ok=True)
app.mount(settings.upload_url_prefix, StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")


@app.on_event("startup")
async def on_startup() -> None:
    """Скелет: создаём таблицы своего торгового домена при старте. (Миграции — Alembic.)"""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as exc:  # noqa: BLE001
        log.warning("[startup] create_all warning: %s", exc)
    log.info("[startup] PartsDonor API started. InvenTree=%s health=%s",
             inventree.base_url, await inventree.health())


# ============================== CHAT (BE-3) ==============================


async def _get_participant(
    dialog_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> DialogParticipant | None:
    return (await db.execute(
        select(DialogParticipant).where(
            DialogParticipant.dialog_id == dialog_id,
            DialogParticipant.user_id == user_id,
        )
    )).scalar_one_or_none()


def _other_participant(
    participants: list[DialogParticipant],
    user_id: uuid.UUID,
) -> DialogParticipant | None:
    for p in participants:
        if p.user_id != user_id:
            return p
    return None


@router.get("/dialogs")
async def list_dialogs(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.seller, UserRole.admin)),
) -> list[DialogOut]:
    """Список диалогов текущего пользователя."""
    stmt = (
        select(DialogParticipant)
        .where(DialogParticipant.user_id == user.id)
        .order_by(DialogParticipant.dialog_id.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    dialog_ids = [r.dialog_id for r in rows]
    if not dialog_ids:
        return []

    # Загружаем диалоги с last_message
    dialogs_stmt = (
        select(Dialog)
        .where(Dialog.id.in_(dialog_ids))
        .options(
            selectinload(Dialog.messages).selectinload(Message.author),
            selectinload(Dialog.messages).selectinload(Message.offer),
        )
    )
    dialog_rows = (await db.execute(dialogs_stmt)).scalars().all()
    dialog_map = {d.id: d for d in dialog_rows}

    # Загружаем участников для получения other_participant
    part_stmt = (
        select(DialogParticipant)
        .where(DialogParticipant.dialog_id.in_(dialog_ids))
        .options(selectinload(DialogParticipant.user))
    )
    part_rows = (await db.execute(part_stmt)).scalars().all()
    parts_by_dialog: dict[uuid.UUID, list[DialogParticipant]] = {}
    for p in part_rows:
        parts_by_dialog.setdefault(p.dialog_id, []).append(p)

    # Загружаем companies для имён
    company_ids = set()
    for p in parts_by_dialog.values():
        for pp in p:
            if pp.user_id != user.id:
                company_ids.add(pp.user.company_id) if pp.user.company_id else None

    companies = {}
    if company_ids:
        comp_rows = (await db.execute(select(Company).where(Company.id.in_(company_ids)))).scalars().all()
        companies = {c.id: c for c in comp_rows}

    result = []
    for pp in rows:
        dialog = dialog_map.get(pp.dialog_id)
        if dialog is None:
            continue

        # Вычисляем unread_count
        other = _other_participant(parts_by_dialog.get(pp.dialog_id, []), user.id)
        last_read = pp.last_read_at
        epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
        unread = 0
        if last_read is None:
            last_read = epoch
        for msg in dialog.messages:
            if msg.author_id != user.id and msg.created_at > last_read:
                unread += 1

        # last_message
        last_msg = None
        if dialog.messages:
            last_msg = max(dialog.messages, key=lambda m: m.created_at or datetime.min.replace(tzinfo=timezone.utc))

        # other participant info
        other_id = None
        other_name = ""
        if other and other.user_id != user.id:
            other_id = other.user_id
            comp = companies.get(other.user.company_id) if other.user.company_id else None
            other_name = comp.name if comp else (other.user.email if other.user.email else str(other.user_id))

        result.append(DialogOut(
            id=dialog.id,
            listing_id=dialog.listing_id,
            donor_lot_id=dialog.donor_lot_id,
            created_at=dialog.created_at,
            updated_at=dialog.updated_at,
            unread_count=unread,
            last_message=MessageOut(
                id=last_msg.id,
                dialog_id=last_msg.dialog_id,
                author_id=last_msg.author_id,
                kind=last_msg.kind,
                body=last_msg.body,
                offer_id=last_msg.offer_id,
                offer_status=last_msg.offer.status if last_msg.offer else None,
                attachment_url=last_msg.attachment_url,
                created_at=last_msg.created_at,
                read=last_msg.created_at <= last_read if last_msg.created_at else True,
            ) if last_msg else None,
            other_participant_id=other_id or uuid.UUID(int=0),
            other_participant_name=other_name,
        ))

    result.sort(key=lambda d: d.updated_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return result


@router.post("/dialogs", response_model=DialogDetailOut, status_code=201)
async def create_dialog(
    payload: DialogCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.seller, UserRole.admin)),
) -> DialogDetailOut:
    """Создать или получить существующий диалог между me и participant_id."""
    if payload.participant_id == user.id:
        raise HTTPException(status_code=400, detail="Нельзя создать диалог с самим собой")

    # Ищем существующий диалог для этой пары
    existing = await db.execute(select(DialogParticipant).where(
        DialogParticipant.user_id == user.id,
    ))
    my_parts = existing.scalars().all()

    for my_part in my_parts:
        other = await db.execute(select(DialogParticipant).where(
            DialogParticipant.dialog_id == my_part.dialog_id,
            DialogParticipant.user_id == payload.participant_id,
        ))
        if other.scalar_one_or_none():
            dialog = await db.get(Dialog, my_part.dialog_id)
            if dialog:
                return await _dialog_detail_out(dialog, payload.participant_id, db, user)

    # Создаём новый диалог
    dialog = Dialog(
        listing_id=payload.listing_id,
        donor_lot_id=payload.donor_lot_id,
    )
    db.add(dialog)
    await db.flush()
    await db.refresh(dialog)

    part1 = DialogParticipant(dialog_id=dialog.id, user_id=user.id)
    part2 = DialogParticipant(dialog_id=dialog.id, user_id=payload.participant_id)
    db.add_all([part1, part2])
    await db.commit()
    await db.refresh(dialog)

    return await _dialog_detail_out(dialog, payload.participant_id, db, user)


async def _dialog_detail_out(
    dialog: Dialog,
    participant_id: uuid.UUID,
    db: AsyncSession,
    user: User,
) -> DialogDetailOut:
    """Помощник: строит DialogDetailOut из диалога."""
    # participants
    parts_stmt = (
        select(DialogParticipant)
        .where(DialogParticipant.dialog_id == dialog.id)
        .options(selectinload(DialogParticipant.user))
    )
    parts_rows = (await db.execute(parts_stmt)).scalars().all()

    companies = {}
    company_ids = set()
    for p in parts_rows:
        if p.user_id != user.id:
            company_ids.add(p.user.company_id) if p.user.company_id else None
    if company_ids:
        comp_rows = (await db.execute(select(Company).where(Company.id.in_(company_ids)))).scalars().all()
        companies = {c.id: c for c in comp_rows}

    participants = [
        DialogParticipantOut(
            dialog_id=p.dialog_id,
            user_id=p.user_id,
            last_read_at=p.last_read_at,
        )
        for p in parts_rows
    ]

    other_id = uuid.UUID(int=0)
    other_name = ""
    for p in parts_rows:
        if p.user_id != user.id:
            other_id = p.user_id
            comp = companies.get(p.user.company_id) if p.user.company_id else None
            other_name = comp.name if comp else (p.user.email if p.user.email else str(p.user_id))

    return DialogDetailOut(
        id=dialog.id,
        listing_id=dialog.listing_id,
        donor_lot_id=dialog.donor_lot_id,
        created_at=dialog.created_at,
        updated_at=dialog.updated_at,
        unread_count=0,
        last_message=None,
        other_participant_id=other_id,
        other_participant_name=other_name,
        participants=participants,
    )


@router.get("/dialogs/{dialog_id}")
async def get_dialog(
    dialog_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.seller, UserRole.admin)),
) -> DialogDetailOut:
    """Получить диалог по ID (только если пользователь — участник)."""
    dialog = await db.get(Dialog, dialog_id)
    if dialog is None:
        raise HTTPException(status_code=404, detail="Dialog not found")

    participant = await _get_participant(dialog_id, user.id, db)
    if participant is None:
        raise HTTPException(status_code=404, detail="Not a participant")

    return await _dialog_detail_out(dialog, user.id, db, user)


@router.get("/dialogs/{dialog_id}/messages", response_model=list[MessageOut])
async def get_messages(
    dialog_id: uuid.UUID,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.seller, UserRole.admin)),
) -> list[MessageOut]:
    """Получить сообщения диалога (ascending)."""
    participant = await _get_participant(dialog_id, user.id, db)
    if participant is None:
        raise HTTPException(status_code=403, detail="Not a participant")

    stmt = (
        select(Message)
        .where(Message.dialog_id == dialog_id)
        .order_by(Message.created_at.asc())
        .offset(offset)
        .limit(limit)
        .options(selectinload(Message.author).selectinload(User.company), selectinload(Message.offer))
    )
    messages = (await db.execute(stmt)).scalars().all()

    last_read = participant.last_read_at or datetime(1970, 1, 1, tzinfo=timezone.utc)

    result = []
    for msg in messages:
        result.append(MessageOut(
            id=msg.id,
            dialog_id=msg.dialog_id,
            author_id=msg.author_id,
            kind=msg.kind,
            body=msg.body,
            offer_id=msg.offer_id,
            offer_status=msg.offer.status if msg.offer else None,
            attachment_url=msg.attachment_url,
            created_at=msg.created_at,
            read=msg.created_at <= last_read,
        ))
    return result


@router.post("/dialogs/{dialog_id}/messages", response_model=MessageOut, status_code=201)
async def send_message(
    dialog_id: uuid.UUID,
    payload: MessageSendIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.seller, UserRole.admin)),
) -> MessageOut:
    """Отправить сообщение в диалог."""
    participant = await _get_participant(dialog_id, user.id, db)
    if participant is None:
        raise HTTPException(status_code=403, detail="Not a participant")

    # Валидация
    if payload.kind == "text":
        if not payload.body or not payload.body.strip():
            raise HTTPException(status_code=400, detail="body is required for text messages")
    elif payload.kind == "offer":
        if payload.offer_price is None or payload.offer_price <= 0:
            raise HTTPException(status_code=400, detail="offer_price > 0 is required for offer messages")
    elif payload.kind == "attachment":
        if not payload.attachment_url:
            raise HTTPException(status_code=400, detail="attachment_url is required for attachment messages")
    else:
        raise HTTPException(status_code=400, detail="Invalid kind")

    # Создаём offer если kind=offer
    offer_id = None
    if payload.kind == "offer":
        offer = Offer(
            dialog_id=dialog_id,
            sender_id=user.id,
            price_rub=payload.offer_price,
            status="pending",
        )
        db.add(offer)
        await db.flush()
        await db.refresh(offer)
        offer_id = offer.id

    msg = Message(
        dialog_id=dialog_id,
        author_id=user.id,
        kind=payload.kind,
        body=payload.body or "",
        offer_id=offer_id,
        attachment_url=payload.attachment_url,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)

    # Обновляем last_read_at отправителя
    participant.last_read_at = datetime.now(timezone.utc)
    # Трогаем updated_at диалога
    dialog = await db.get(Dialog, dialog_id)
    if dialog:
        dialog.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(msg)

    return MessageOut(
        id=msg.id,
        dialog_id=msg.dialog_id,
        author_id=msg.author_id,
        kind=msg.kind,
        body=msg.body,
        offer_id=msg.offer_id,
        offer_status=msg.offer.status if msg.offer else None,
        attachment_url=msg.attachment_url,
        created_at=msg.created_at,
        read=True,
    )


@router.post("/dialogs/{dialog_id}/read", response_model=DialogReadOut)
async def mark_read(
    dialog_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.seller, UserRole.admin)),
) -> DialogReadOut:
    """Пометить сообщения как прочитанные."""
    participant = await _get_participant(dialog_id, user.id, db)
    if participant is None:
        raise HTTPException(status_code=403, detail="Not a participant")

    participant.last_read_at = datetime.now(timezone.utc)
    dialog = await db.get(Dialog, dialog_id)
    if dialog:
        dialog.updated_at = datetime.now(timezone.utc)

    await db.commit()
    return DialogReadOut(ok=True)


@router.post("/offers/{offer_id}/accept", response_model=OfferOut)
async def accept_offer(
    offer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.seller, UserRole.admin)),
) -> OfferOut:
    """Принять оффер (может только другой участник)."""
    offer = await db.get(Offer, offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found")

    if offer.status != "pending":
        raise HTTPException(status_code=409, detail="Offer already resolved")

    if offer.sender_id == user.id:
        raise HTTPException(status_code=403, detail="Sender cannot accept their own offer")

    # Проверяем, что пользователь — участник диалога
    participant = await _get_participant(offer.dialog_id, user.id, db)
    if participant is None:
        raise HTTPException(status_code=403, detail="Not a participant")

    offer.status = "accepted"
    await db.commit()
    await db.refresh(offer)
    return OfferOut(
        id=offer.id,
        dialog_id=offer.dialog_id,
        sender_id=offer.sender_id,
        price_rub=offer.price_rub,
        status=offer.status,
        created_at=offer.created_at,
    )


@router.post("/offers/{offer_id}/reject", response_model=OfferOut)
async def reject_offer(
    offer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.seller, UserRole.admin)),
) -> OfferOut:
    """Отклонить оффер (может только другой участник)."""
    offer = await db.get(Offer, offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found")

    if offer.status != "pending":
        raise HTTPException(status_code=409, detail="Offer already resolved")

    if offer.sender_id == user.id:
        raise HTTPException(status_code=403, detail="Sender cannot reject their own offer")

    participant = await _get_participant(offer.dialog_id, user.id, db)
    if participant is None:
        raise HTTPException(status_code=403, detail="Not a participant")

    offer.status = "rejected"
    await db.commit()
    await db.refresh(offer)
    return OfferOut(
        id=offer.id,
        dialog_id=offer.dialog_id,
        sender_id=offer.sender_id,
        price_rub=offer.price_rub,
        status=offer.status,
        created_at=offer.created_at,
    )


@router.get("/offers", response_model=list[OfferOut])
async def list_offers(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.buyer, UserRole.seller, UserRole.admin)),
) -> list[OfferOut]:
    """Список офферов в диалогах текущего пользователя."""
    # Находим все dialog_id пользователя
    parts_stmt = (
        select(DialogParticipant.dialog_id)
        .where(DialogParticipant.user_id == user.id)
    )
    dialog_ids = list((await db.execute(parts_stmt)).scalars().all())

    if not dialog_ids:
        return []

    stmt = (
        select(Offer)
        .where(Offer.dialog_id.in_(dialog_ids))
        .order_by(Offer.created_at.desc())
        .offset(offset)
        .limit(limit)
        .options(selectinload(Offer.sender).selectinload(User.company))
    )
    offers = (await db.execute(stmt)).scalars().all()

    result = []
    for o in offers:
        result.append(OfferOut(
            id=o.id,
            dialog_id=o.dialog_id,
            sender_id=o.sender_id,
            price_rub=o.price_rub,
            status=o.status,
            created_at=o.created_at,
        ))
    return result
