"""PartsDonor — модели своего торгового домена (отдельная БД).

Эти сущности живут в НАШЕЙ PostgreSQL, ссылаясь на Part/StockItem/Company id
из InvenTree (source of truth инвентаря) — чтобы не лезть в «danger zone»
миграций InvenTree.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


# --- enum'ы ---


class ListingStatus(str, enum.Enum):
    active = "active"      # на продаже
    negotiated = "negotiated"  # в переговорах / забронировано
    sold = "sold"          # продано
    hidden = "hidden"      # скрыто


class PartCondition(str, enum.Enum):
    working = "working"      # рабочая
    for_parts = "for_parts"  # на запчасти
    untested = "untested"    # не проверена
    no_guarantee = "no_guarantee"  # без гарантии


class DealStatus(str, enum.Enum):
    created = "created"          # создана (ожидание оплаты)
    paid_escrow = "paid_escrow"  # деньги в эскроу (ЮKassa)
    shipped = "shipped"          # отгружено (СДЭК)
    delivered = "delivered"      # доставлено
    completed = "completed"      # подтверждено покупателем, деньги продавцу
    refunded = "refunded"        # возврат
    dispute = "dispute"          # спор / арбитраж


# --- модели ---


class DeviceSchema(Base):
    """Развёртка модели телефона: изображение + hotspots → part (компонент донора)."""

    __tablename__ = "device_schemas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # device: brand/model (для витрины), НЕ part_id (part_id на уровне listing/донора)
    brand: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(128))
    # exploded view image: путь/URL к изображению развёртки
    exploded_view_url: Mapped[str] = mapped_column(Text, default="")
    # hotspots: {"display": {"x":0.2,"y":0.3}, "board": {...}, ...}
    # ключ = слот компонента, значение = координаты % на изображении
    hotspots: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Listing(Base):
    """Объявление на витрине: конкретный StockItem из InvenTree, который продаёт мастерская."""

    __tablename__ = "listings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # part_id — id Part'а в InvenTree (компонент: дисплей/плата/АКБ...)
    inventree_part_id: Mapped[int | None] = mapped_column(nullable=True)
    # stock_item_id — конкретный экземпляр в InvenTree StockItem
    inventree_stock_id: Mapped[int | None] = mapped_column(nullable=True)
    # seller — id Company в InvenTree (мастерская-продавец)
    inventree_seller_id: Mapped[int | None] = mapped_column(nullable=True)
    # device_schema — к какой развёртке/донору относится (опционально)
    device_schema_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("device_schemas.id"))

    title: Mapped[str] = mapped_column(String(200))
    price_rub: Mapped[float] = mapped_column(Float)
    condition: Mapped[PartCondition] = mapped_column(
        Enum(PartCondition, name="part_condition"), default=PartCondition.untested
    )
    # история происхождения: «снято с iPhone 13 Pro, после падения, плата не восстановлена»
    provenance: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[ListingStatus] = mapped_column(
        Enum(ListingStatus, name="listing_status"), default=ListingStatus.active
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Deal(Base):
    """Сделка B2B: buyer ↔ seller, ЮKassa эскроу, СДЭК доставка."""

    __tablename__ = "deals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("listings.id"))
    buyer_company_id: Mapped[int | None] = mapped_column(nullable=True)  # InvenTree Company
    seller_company_id: Mapped[int | None] = mapped_column(nullable=True)

    status: Mapped[DealStatus] = mapped_column(
        Enum(DealStatus, name="deal_status"), default=DealStatus.created
    )
    amount_rub: Mapped[float] = mapped_column(Float)
    # ЮKassa: id платежа/безопасной сделки, статус escrow
    yookassa_payment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    escrow_status: Mapped[str] = mapped_column(String(32), default="")
    # СДЭК: номер заказа/отправления
    sdek_order_uuid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sdek_tracking: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Review(Base):
    """Отзыв/рейтинг (доверие для б/у)."""

    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id"))
    rating: Mapped[int] = mapped_column(default=5)  # 1..5
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
