"""PartsDonor backend — FastAPI app и роуты (скелет торгового слоя).

Роуты:
  - GET  /health            — статус backend + связь с InvenTree
  - CRUD /device-schemas    — развёртки моделей (hotspots → part)
  - CRUD /listings          — объявления на витрине
  -      /deals             — сделки (ЮKassa эскроу, СДЭК) — заглушка создания
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import engine, get_db
from app.inventree_client import inventree
from app.models import Base, Deal, DeviceSchema, Listing
from app.schemas import (
    DealOut,
    DeviceSchemaIn,
    DeviceSchemaOut,
    HealthOut,
    ListingIn,
    ListingOut,
)

log = logging.getLogger("partsdonor.main")

app = FastAPI(title="PartsDonor API", version="0.1.0")
router = APIRouter()


# --- health ---


@router.get("/health", response_model=HealthOut)
async def health() -> HealthOut:
    return HealthOut(
        partsdonor_backend="ok",
        inventree=inventree.health(),
        inventree_base_url=inventree.base_url,
    )


# --- device_schemas (развёртки) ---


@router.get("/device-schemas", response_model=list[DeviceSchemaOut])
async def list_device_schemas(db: AsyncSession = Depends(get_db)) -> list[DeviceSchema]:
    result = await db.execute(select(DeviceSchema).order_by(DeviceSchema.created_at.desc()))
    return list(result.scalars().all())


@router.post("/device-schemas", response_model=DeviceSchemaOut, status_code=201)
async def create_device_schema(
    payload: DeviceSchemaIn, db: AsyncSession = Depends(get_db)
) -> DeviceSchema:
    record = DeviceSchema(
        brand=payload.brand,
        model=payload.model,
        exploded_view_url=payload.exploded_view_url,
        hotspots={k: v.model_dump() for k, v in payload.hotspots.items()},
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


# --- listings ---


@router.get("/listings", response_model=list[ListingOut])
async def list_listings(db: AsyncSession = Depends(get_db)) -> list[Listing]:
    result = await db.execute(select(Listing).order_by(Listing.created_at.desc()))
    return list(result.scalars().all())


@router.post("/listings", response_model=ListingOut, status_code=201)
async def create_listing(payload: ListingIn, db: AsyncSession = Depends(get_db)) -> Listing:
    record = Listing(**payload.model_dump())
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


# --- deals (заглушка; ЮKassa/СДЭК позже) ---


@router.get("/deals", response_model=list[DealOut])
async def list_deals(db: AsyncSession = Depends(get_db)) -> list[Deal]:
    result = await db.execute(select(Deal).order_by(Deal.created_at.desc()))
    return list(result.scalars().all())


@router.get("/deals/{deal_id}", response_model=DealOut)
async def get_deal(deal_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Deal:
    record = await db.get(Deal, deal_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    return record


app.include_router(router)


@app.get("/", include_in_schema=False)
async def root():
    # Удобно глянуть OpenAPI-доку в браузере.
    return RedirectResponse(url="/docs")


@app.on_event("startup")
async def on_startup() -> None:
    # Скелет: создаём таблицы нашего торгового домена при первом старте.
    # (Позже миграции через Alembic.)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] create_all warning: {exc}")
    print(f"[startup] PartsDonor API started. InvenTree={inventree.base_url} health={inventree.health()}")
