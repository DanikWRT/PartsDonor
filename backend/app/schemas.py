"""PartsDonor — Pydantic-схемы API (запросы/ответы)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models import DealStatus, ListingStatus, PartCondition


# --- DeviceSchema (развёртка) ---


class HotspotIn(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class DeviceSchemaIn(BaseModel):
    brand: str
    model: str
    exploded_view_url: str = ""
    hotspots: dict[str, HotspotIn] = {}


class DeviceSchemaOut(BaseModel):
    id: uuid.UUID
    brand: str
    model: str
    exploded_view_url: str
    hotspots: dict[str, HotspotIn]
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Listing ---


class ListingIn(BaseModel):
    inventree_part_id: int | None = None
    inventree_stock_id: int | None = None
    inventree_seller_id: int | None = None
    device_schema_id: uuid.UUID | None = None
    title: str
    price_rub: float = Field(gt=0)
    condition: PartCondition = PartCondition.untested
    provenance: str = ""


class ListingOut(BaseModel):
    id: uuid.UUID
    inventree_part_id: int | None
    inventree_stock_id: int | None
    inventree_seller_id: int | None
    device_schema_id: uuid.UUID | None
    title: str
    price_rub: float
    condition: PartCondition
    provenance: str
    status: ListingStatus
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Deal ---


class DealOut(BaseModel):
    id: uuid.UUID
    listing_id: uuid.UUID
    status: DealStatus
    amount_rub: float
    yookassa_payment_id: str | None
    escrow_status: str
    sdek_order_uuid: str | None
    sdek_tracking: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Прочее ---


class HealthOut(BaseModel):
    partsdonor_backend: str = "ok"
    inventree: bool
    inventree_base_url: str
