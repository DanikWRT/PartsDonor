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

import logging
import uuid

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import engine, get_db
from app.inventree_client import inventree
from app.models import (
    Base,
    Company,
    Deal,
    DealStatus,
    DeviceSchema,
    Listing,
    ListingStatus,
    Review,
)
from app.schemas import (
    CatalogDetail,
    CatalogItem,
    CatalogListingOut,
    CompanyIn,
    CompanyOut,
    DealCreate,
    DealOut,
    DealStatusUpdate,
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
)

log = logging.getLogger("partsdonor.main")

app = FastAPI(title="PartsDonor API", version="0.2.0")
router = APIRouter()


# ============================== HEALTH ==============================


@router.get("/health", response_model=HealthOut)
async def health() -> HealthOut:
    return HealthOut(
        partsdonor_backend="ok",
        inventree=inventree.health(),
        inventree_base_url=inventree.base_url,
    )


# ============================== CATALOG (из InvenTree) ==============================


@router.get("/catalog", response_model=list[CatalogItem])
async def catalog(
    q: str | None = Query(default=None, description="Поиск по названию бренда/модели/типа"),
    category: int | None = Query(default=None, description="id категории InvenTree"),
    status: ListingStatus | None = Query(default=None, description="статус листинга"),
    price_from: float | None = Query(default=None, description="Мин. цена"),
    price_to: float | None = Query(default=None, description="Макс. цена"),
    only_stock: bool = Query(default=False, description="Только в наличии на складе"),
    sort: str | None = Query(default=None, description="price_asc|price_desc|name"),
    db: AsyncSession = Depends(get_db),
) -> list[CatalogItem]:
    """Каталог деталей. Данные — из InvenTree (source of truth), цены — с наших листингов."""
    parts = inventree.search_parts(search=q, category=category)
    cat_names = inventree.category_name_map()

    # Все активные листинги + продавец (для рейтинга/гарантии)
    listing_rows = (
        await db.execute(
            select(Listing)
            .options(selectinload(Listing.seller))
            .where(Listing.status == ListingStatus.active)
            .order_by(Listing.price_rub.asc())
        )
    ).scalars().all()
    # лучший (самый дешёвый) активный листинг по каждой части
    listing_by_part: dict[int | None, Listing | None] = {}
    for l in listing_rows:
        if l.inventree_part_id is not None and l.inventree_part_id not in listing_by_part:
            listing_by_part[l.inventree_part_id] = l

    # В наличии (StockItem): часть встречается на складе
    stock_parts = {s["part"] for s in inventree.list_stock()}

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
        items.append(
            CatalogItem(
                id=pid,
                name=p.get("name") or "",
                category=cat_name,
                is_assembly=bool(p.get("assembly")),
                in_stock=in_stock,
                listing_price=listing.price_rub if listing else None,
                listing_status=listing.status.value if listing else None,
                listing_condition=listing.condition.value if listing else None,
                listing_provenance=listing.provenance if listing else None,
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
        part = inventree.get_part(part_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Деталь не найдена в InvenTree") from exc

    cat_names = inventree.category_name_map()
    raw_cat = part.get("category")
    cat_name = ""
    if isinstance(raw_cat, int):
        cat_name = cat_names.get(raw_cat, "")

    stock_parts = {s["part"] for s in inventree.list_stock()}

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
    for l in active:
        seller = l.seller
        listing_outs.append(
            CatalogListingOut(
                id=l.id,
                title=l.title,
                price_rub=l.price_rub,
                condition=l.condition.value,
                provenance=l.provenance,
                status=l.status.value,
                seller_name=seller.name if seller else None,
                seller_rating=seller.rating if seller else None,
                seller_verified=seller.verified if seller else None,
            )
        )
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
        donor = inventree.get_part(donor_part_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Донор не найден в InvenTree") from exc

    bom_subs = inventree.get_bom_subs(donor_part_id)

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
    db: AsyncSession = Depends(get_db),
) -> list[Listing]:
    stmt = select(Listing).order_by(Listing.created_at.desc())
    if status is not None:
        stmt = stmt.where(Listing.status == status)
    return list((await db.execute(stmt)).scalars().all())


@router.post("/listings", response_model=ListingOut, status_code=201)
async def create_listing(payload: ListingIn, db: AsyncSession = Depends(get_db)) -> Listing:
    data = payload.model_dump()
    if data.get("seller_id"):
        seller = await db.get(Company, data["seller_id"])
        if seller is None:
            raise HTTPException(status_code=400, detail="seller_id: Company не найден")
    record = Listing(**data)
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.get("/listings/{listing_id}", response_model=ListingOut)
async def get_listing(listing_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Listing:
    record = await db.get(Listing, listing_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return record


@router.patch("/listings/{listing_id}", response_model=ListingOut)
async def update_listing(
    listing_id: uuid.UUID, payload: ListingUpdate, db: AsyncSession = Depends(get_db)
) -> Listing:
    record = await db.get(Listing, listing_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(record, k, v)
    await db.commit()
    await db.refresh(record)
    return record


# ============================== DEALS (статусная машина + escrow) ==============================

# Допустимые переходы статусной машины сделки
_DEAL_TRANSITIONS: dict[DealStatus, set[DealStatus]] = {
    DealStatus.created: {DealStatus.paid_escrow, DealStatus.refunded, DealStatus.dispute},
    DealStatus.paid_escrow: {DealStatus.shipped, DealStatus.refunded, DealStatus.dispute},
    DealStatus.shipped: {DealStatus.delivered, DealStatus.dispute},
    DealStatus.delivered: {DealStatus.completed, DealStatus.refunded, DealStatus.dispute},
    DealStatus.completed: set(),
    DealStatus.refunded: set(),
    DealStatus.dispute: {DealStatus.refunded, DealStatus.delivered},
}

_ESCROW_BY_DEAL: dict[DealStatus, str] = {
    DealStatus.created: "created",
    DealStatus.paid_escrow: "paid",
    DealStatus.shipped: "in_progress",
    DealStatus.delivered: "in_progress",
    DealStatus.completed: "released",
    DealStatus.refunded: "refunded",
    DealStatus.dispute: "in_progress",
}


def _check_transition(current: DealStatus, target: DealStatus) -> None:
    if target not in _DEAL_TRANSITIONS[current]:
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимый переход статуса сделки: {current.value} -> {target.value}",
        )


@router.post("/deals", response_model=DealOut, status_code=201)
async def create_deal(payload: DealCreate, db: AsyncSession = Depends(get_db)) -> Deal:
    """Создание сделки по listing'у. Автоматически резервирует листинг (negotiated)."""
    listing = await db.get(Listing, payload.listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.status == ListingStatus.sold:
        raise HTTPException(status_code=400, detail="Товар уже продан")

    buyer = await db.get(Company, payload.buyer_company_id)
    if buyer is None:
        raise HTTPException(status_code=400, detail="buyer_company_id: Company не найден")

    amount = payload.amount_rub or listing.price_rub
    deal = Deal(
        listing_id=listing.id,
        buyer_company_id=buyer.id,
        status=DealStatus.created,
        amount_rub=amount,
        escrow_status="created",
        shipping_address=payload.shipping_address,
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


@router.patch("/deals/{deal_id}/status", response_model=DealOut)
async def update_deal_status(
    deal_id: uuid.UUID, payload: DealStatusUpdate, db: AsyncSession = Depends(get_db)
) -> Deal:
    """Перевод сделки по статусной машине; escrow-статус обновляется автоматически."""
    record = await db.get(Deal, deal_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Deal not found")

    _check_transition(record.status, payload.status)
    record.status = payload.status
    record.escrow_status = _ESCROW_BY_DEAL[payload.status]  # type: ignore[assignment]
    await db.commit()
    await db.refresh(record)
    return record


# ============================== REVIEWS ==============================


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
             inventree.base_url, inventree.health())
