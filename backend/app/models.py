"""PartsDonor — модели своего торгового домена (отдельная PostgreSQL).

Эти сущности живут в НАШЕЙ БД, ссылаясь на Part/StockItem/Company из InvenTree
(source of truth инвентаря) по их pk — чтобы не лезть в «danger zone» миграций
InvenTree.

Сущности (по data-model.md / MVP-scope.md):
  - Company       — мастерская (продавец/покупатель)
  - DeviceSchema  — модель телефона + развёртка + hotspots (JSON)
  - Listing       — объявление на витрине (часть, цена, статус, продавец)
  - Deal          — сделка buyer↔seller + escrow-статус (ЮKassa)
  - Review        — рейтинг/отзыв продавца (доверие для б/у)
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
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# --- enum'ы ---


class ListingStatus(str, enum.Enum):
    active = "active"            # на продаже
    negotiated = "negotiated"    # в переговорах / забронировано
    sold = "sold"                # продано
    hidden = "hidden"            # скрыто


class PartCondition(str, enum.Enum):
    working = "working"          # рабочая
    for_parts = "for_parts"      # на запчасти
    untested = "untested"        # не проверена
    no_guarantee = "no_guarantee"  # без гарантии


class DealStatus(str, enum.Enum):
    created = "created"                    # создана, ожидание escrow-оплаты
    escrow_paid = "escrow_paid"            # деньги в эскроу (ЮKassa Безопасная сделка)
    seller_confirmed = "seller_confirmed"  # продавец подтвердил готовность
    shipped = "shipped"                    # отгружено (СДЭК)
    delivered = "delivered"                # получено покупателем
    buyer_confirmed = "buyer_confirmed"    # покупатель подтвердил получение
    payout = "payout"                      # выплата продавцу
    completed = "completed"                # завершено
    refunded = "refunded"                  # возврат покупателю
    dispute = "dispute"                    # спор / арбитраж


class UserRole(str, enum.Enum):
    seller = "seller"
    buyer = "buyer"
    admin = "admin"


class EscrowStatus(str, enum.Enum):
    created = "created"          # счёт создан, ожидание оплаты
    paid = "paid"                # оплачено, деньги заморожены
    in_progress = "in_progress"  # безопасная сделка в работе (после оплаты)
    released = "released"        # выплачено продавцу
    refunded = "refunded"        # возвращено покупателю


# --- модели ---


class User(Base):
    """Аккаунт пользователя маркетплейса (B8).

    Роли: seller (мастерская), buyer, admin. seller опционально привязан к
    Company (мастерской) через company_id — по нему проверяем владение
    листингами/сделками.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), default=UserRole.buyer
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("companies.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company: Mapped[Company | None] = relationship()


class Company(Base):
    """Мастерская — продавец и/или покупатель на маркетплейсе.

    Может ссылаться на Company из InvenTree (inventree_company_id), но живёт в
    нашем слое: здесь торговые поля (рейтинг, верификация).
    """

    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inventree_company_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(32), default="seller")  # seller|buyer|both
    slug: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True)
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    verified: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    listings: Mapped[list["Listing"]] = relationship(back_populates="seller")


class DeviceSchema(Base):
    """Развёртка модели телефона: изображение + hotspots → слоты.

    hotspots: {slot: {"x": 0.2, "y": 0.3}, ...}; слот ↔ компонент донора
    (display/board/battery/camera/backcover) из BOM InvenTree.
    """

    __tablename__ = "device_schemas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # device: brand/model (витрина). inventree_donor_part_id — Part-донор в InvenTree.
    brand: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(128))
    inventree_donor_part_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exploded_view_url: Mapped[str] = mapped_column(Text, default="")
    hotspots: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Listing(Base):
    """Объявление на витрине: конкретная деталь (Part/StockItem InvenTree) на продажу."""

    __tablename__ = "listings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Внешние ключи на инвентарь InvenTree (source of truth)
    inventree_part_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    inventree_stock_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Продавец (мастерская) — наш Company
    seller_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    # К какой развёртке/донору относится (опционально)
    device_schema_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("device_schemas.id"), nullable=True
    )

    title: Mapped[str] = mapped_column(String(200))
    price_rub: Mapped[float] = mapped_column(Float)
    condition: Mapped[PartCondition] = mapped_column(
        Enum(PartCondition, name="part_condition"), default=PartCondition.untested
    )
    provenance: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[ListingStatus] = mapped_column(
        Enum(ListingStatus, name="listing_status"), default=ListingStatus.active
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    seller: Mapped[Company | None] = relationship(back_populates="listings")
    deals: Mapped[list["Deal"]] = relationship(back_populates="listing")


class Deal(Base):
    """Сделка B2B: buyer (наш Company) ↔ seller через listing + escrow-статус ЮKassa."""

    __tablename__ = "deals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("listings.id"))
    buyer_company_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("companies.id"), nullable=True
    )
    seller_company_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("companies.id"), nullable=True
    )

    status: Mapped[DealStatus] = mapped_column(
        Enum(DealStatus, name="deal_status"), default=DealStatus.created
    )
    amount_rub: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(8), default="RUB")
    # ЮKassa Безопасная сделка: id платежа/сделки + escrow-статус
    yookassa_payment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    escrow_status: Mapped[EscrowStatus] = mapped_column(
        Enum(EscrowStatus, name="escrow_status"), default=EscrowStatus.created
    )
    # СДЭК доставка (упрощённо в MVP)
    sdek_order_uuid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sdek_tracking: Mapped[str | None] = mapped_column(String(64), nullable=True)
    shipping_address: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # История переходов статусной машины: [{"from":..., "to":..., "at":...}, ...]
    transitions: Mapped[list] = mapped_column(JSON, default=list)

    listing: Mapped[Listing] = relationship(back_populates="deals")
    buyer: Mapped[Company | None] = relationship(foreign_keys=[buyer_company_id])
    seller: Mapped[Company | None] = relationship(foreign_keys=[seller_company_id])


class BuyerProfile(Base):
    """Профиль покупателя: реквизиты плательщика + адрес доставки по умолчанию.

    Нужен для «Купить в 1 клик» у верифицированных B2B-покупателей (UX-1).
    Один профиль на компанию-покупателя.
    """

    __tablename__ = "buyer_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id"), unique=True, index=True
    )
    billing_payer_name: Mapped[str] = mapped_column(String(200), default="")
    billing_inn: Mapped[str] = mapped_column(String(64), default="")
    default_address: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    company: Mapped[Company | None] = relationship()


class Review(Base):
    """Отзыв/рейтинг продавца (доверие для б/у рынка)."""

    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("deals.id"), nullable=True)
    seller_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    rating: Mapped[int] = mapped_column(Integer, default=5)  # 1..5
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
