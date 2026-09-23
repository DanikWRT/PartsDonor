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
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import engine, get_db
from app.deal_machine import ESCROW_BY_DEAL, validate_transition
from app.inventree_client import inventree
from app.auth import admin_router, auth_router, get_current_user, require_roles
from app.models import (
    User,
    UserRole,
    Base,
    BuyerProfile,
    Company,
    Deal,
    DealStatus,
    DeviceSchema,
    Listing,
    ListingStatus,
    ListingSubscription,
    PartCondition,
    Review,
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
        image_url=None,
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
            )
        )

    return DonorSchema(
        brand=donor.get("category_detail", {}).get("name", "") if donor.get("category_detail") else "",
        model=donor.get("name", str(donor_part_id)),
        exploded_view_url="",  # изображение развёртки подключим на фронте отдельно
        components=components,
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


app.include_router(router)
app.include_router(auth_router)
app.include_router(admin_router)


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
