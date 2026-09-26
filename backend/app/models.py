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
    UniqueConstraint,
    Index,
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


class BuyRequestType(str, enum.Enum):
    """Тип заявки «Куплю»."""
    part = "part"
    phone = "phone"


class BuyRequestStatus(str, enum.Enum):
    """Статус заявки «Куплю»."""
    open = "open"
    accepted = "accepted"
    closed = "closed"


class BuyResponseStatus(str, enum.Enum):
    """Статус отклика на заявку «Куплю»."""
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"


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
    # Цельный листинг донора (донор-комплект целиком)
    donor_lot_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("donor_lots.id"), nullable=True
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
    donor_lot: Mapped["DonorLot | None"] = relationship(back_populates="listing")


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


class BuyRequest(Base):
    """Заявка «Куплю» (BE-2)."""

    __tablename__ = "buy_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type: Mapped[BuyRequestType] = mapped_column(Enum(BuyRequestType, name="buy_request_type"), nullable=False)
    brand: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    cond: Mapped[str | None] = mapped_column(String(32), nullable=True)
    budget: Mapped[float] = mapped_column(Float, nullable=False)
    urgent: Mapped[bool] = mapped_column(default=False)
    city: Mapped[str | None] = mapped_column(String(64), nullable=True)
    buyer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"), nullable=False)
    status: Mapped[BuyRequestStatus] = mapped_column(
        Enum(BuyRequestStatus, name="buy_request_status"), default=BuyRequestStatus.open
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    buyer: Mapped[Company] = relationship(foreign_keys=[buyer_id])
    responses: Mapped[list["BuyRequestResponse"]] = relationship(back_populates="buy_request")

    __table_args__ = (
        Index("ix_buy_requests_status", "status"),
        Index("ix_buy_requests_type", "type"),
        Index("ix_buy_requests_brand", "brand"),
        Index("ix_buy_requests_buyer_id", "buyer_id"),
    )


class BuyRequestResponse(Base):
    """Отклик на заявку «Куплю» (BE-2)."""

    __tablename__ = "buy_request_responses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    buy_request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("buy_requests.id"), nullable=False)
    seller_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"), nullable=False)
    message: Mapped[str] = mapped_column(Text, default="")
    offer_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[BuyResponseStatus] = mapped_column(
        Enum(BuyResponseStatus, name="buy_response_status"), default=BuyResponseStatus.pending
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    buy_request: Mapped[BuyRequest] = relationship(back_populates="responses")
    seller: Mapped[Company] = relationship(foreign_keys=[seller_id])

    __table_args__ = (
        Index("ix_buy_request_responses_buy_request_id", "buy_request_id"),
    )


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


class ListingSubscription(Base):
    """Подписка компании на «Сообщить, когда появится» по детали (UX-2).

    Одна подписка на (company_id, inventree_part_id). Когда по части появляется
    НОВЫЙ активный листинг, подписка помечается notified=True + notified_at —
    подписчик читает уведомления через GET /notifications.
    """

    __tablename__ = "listing_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id"), index=True
    )
    inventree_part_id: Mapped[int] = mapped_column(Integer)
    notified: Mapped[bool] = mapped_column(default=False)
    notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("company_id", "inventree_part_id", name="uq_subscription_company_part"),
    )


class Review(Base):
    """Отзыв/рейтинг продавца (доверие для б/у рынка)."""

    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("deals.id"), nullable=True)
    seller_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    rating: Mapped[int] = mapped_column(Integer, default=5)  # 1..5
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DonorLot(Base):
    """Донор-комплект на продажу целиком (S1)."""

    __tablename__ = "donor_lots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_schema_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("device_schemas.id"), nullable=False)
    seller_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200))
    price_rub: Mapped[float]
    condition: Mapped[PartCondition] = mapped_column(
        Enum(PartCondition, name="donor_part_condition"), default=PartCondition.untested
    )
    provenance: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[ListingStatus] = mapped_column(
        Enum(ListingStatus, name="donor_lot_status"), default=ListingStatus.active
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    device_schema: Mapped[DeviceSchema] = relationship()
    seller: Mapped[Company] = relationship()
    requests: Mapped[list["DonorRequest"]] = relationship(back_populates="donor_lot")
    listing: Mapped[Listing | None] = relationship(back_populates="donor_lot")


class DonorRequest(Base):
    """Заявка/торг покупателя на донор-комплект (S1)."""

    __tablename__ = "donor_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    donor_lot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("donor_lots.id"), nullable=False)
    buyer_company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"), nullable=False)
    seller_company_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    amount_rub: Mapped[float]
    message: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    donor_lot: Mapped[DonorLot] = relationship(back_populates="requests")
    buyer: Mapped[Company] = relationship(foreign_keys=[buyer_company_id])
    seller: Mapped[Company | None] = relationship(foreign_keys=[seller_company_id])


# --- BE-1: wizard донора + photos/uploads ---


class DonorStatus(str, enum.Enum):
    """Статус донора в визарде (BE-1). draft — черновик, published — опубликован."""

    draft = "draft"
    published = "published"
    archived = "archived"


class Donor(Base):
    """Донор (цельный разобранный смартфон), создаваемый через wizard (BE-1).

    Отличие от DonorLot (S1): Donor — это РЕДАКТИРУЕМЫЙ черновик мастера со
    своим составом частей (donor_parts) и фото (photos), проходящий стадии
    draft → published → archived. Публикация делает донора видимым и создаёт
    DonorLot (чтобы он появлялся на витрине доноров). DonorLot (S1) остаётся
    нетронутым — донор лишь порождает его при публикации.
    """

    __tablename__ = "donors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    seller_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"), nullable=False)
    device_schema_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("device_schemas.id"), nullable=True
    )
    # Денормализованные бренд/модель (для фильтров на витрине без join)
    brand: Mapped[str] = mapped_column(String(64), default="")
    model: Mapped[str] = mapped_column(String(128), default="")
    title: Mapped[str] = mapped_column(String(200), default="")
    price_rub: Mapped[float] = mapped_column(Float, default=0.0)
    condition: Mapped[PartCondition] = mapped_column(
        Enum(PartCondition, name="donor_condition"), default=PartCondition.untested
    )
    provenance: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[DonorStatus] = mapped_column(
        Enum(DonorStatus, name="donor_status"), default=DonorStatus.draft
    )
    # id созданного при публикации DonorLot (алиас на витрине доноров)
    donor_lot_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("donor_lots.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    seller: Mapped[Company] = relationship()
    device_schema: Mapped[DeviceSchema | None] = relationship()
    parts: Mapped[list["DonorPart"]] = relationship(
        back_populates="donor", cascade="all, delete-orphan", order_by="DonorPart.sort"
    )
    photos: Mapped[list["Photo"]] = relationship(
        primaryjoin="and_(Photo.owner_type=='donor', Photo.owner_id==Donor.id)",
        foreign_keys="[Photo.owner_id]",
        viewonly=True,
        order_by="Photo.sort",
    )


class DonorPart(Base):
    """Одна деталь в составе донора (BE-1): слот, цена, статус."""

    __tablename__ = "donor_parts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    donor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("donors.id"), nullable=False)
    slot: Mapped[str] = mapped_column(String(64), default="")  # слот/компонент (display/board/...)
    title: Mapped[str] = mapped_column(String(200), default="")
    inventree_part_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_rub: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active|sold|none
    sort: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    donor: Mapped[Donor] = relationship(back_populates="parts")


class Photo(Base):
    """Фото, привязанное к любому владельцу (BE-1): polymorphic owner_type/owner_id.

    owner_type: donor | company | part | ... ; url — путь/ссылка на файл в storage;
    sort — порядок при отдаче галереи.
    """

    __tablename__ = "photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_type: Mapped[str] = mapped_column(String(32), index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    url: Mapped[str] = mapped_column(Text, default="")
    sort: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# --- BE-3: chat (dialogs/messages/offers) ---


class MessageKind(str, enum.Enum):
    """Тип сообщения в чате."""
    text = "text"
    offer = "offer"
    attachment = "attachment"


class OfferStatus(str, enum.Enum):
    """Статус оффера в чате."""
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"


class Dialog(Base):
    """Диалог (чат) между участниками, привязанный к listing или donor_lot."""

    __tablename__ = "dialogs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("listings.id"), nullable=True)
    donor_lot_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("donor_lots.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    listing: Mapped[Listing | None] = relationship(foreign_keys=[listing_id])
    donor_lot: Mapped[DonorLot | None] = relationship()
    participants: Mapped[list["DialogParticipant"]] = relationship(back_populates="dialog")
    messages: Mapped[list["Message"]] = relationship(back_populates="dialog")


class DialogParticipant(Base):
    """Участник диалога (P2P, 2 строки на диалог)."""

    __tablename__ = "dialog_participants"

    dialog_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dialogs.id"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    dialog: Mapped[Dialog] = relationship(back_populates="participants")
    user: Mapped[User] = relationship()


class Message(Base):
    """Сообщение в диалоге."""

    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dialog_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dialogs.id"), nullable=False)
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, server_default="text")
    body: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    offer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("offers.id"), nullable=True)
    attachment_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    author: Mapped[User] = relationship()
    dialog: Mapped[Dialog] = relationship(back_populates="messages")
    offer: Mapped["Offer | None"] = relationship()


class Offer(Base):
    """Оффер (предложение о покупке) в диалоге."""

    __tablename__ = "offers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dialog_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dialogs.id"), nullable=False)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    price_rub: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sender: Mapped[User] = relationship()
    dialog: Mapped[Dialog] = relationship()
    message: Mapped["Message | None"] = relationship()


# --- BE-4: knowledge base (kb_articles/categories) ---


class KbCategory(Base):
    """Рубрика базы знаний (схемы/разборка/совместимость/лайфхаки/ремонт)."""

    __tablename__ = "kb_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    sort: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class KbArticle(Base):
    """Статья базы знаний: рубрика (slug категории), текст, автор, рейтинг/просмотры."""

    __tablename__ = "kb_articles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cat: Mapped[str] = mapped_column(String(64), index=True)  # rubric slug — match kb_categories.slug
    title: Mapped[str] = mapped_column(String(200))
    excerpt: Mapped[str] = mapped_column(Text, default="")
    body: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(128), default="")  # phone model / "" for general
    tags: Mapped[str] = mapped_column(String(255), default="")   # comma-separated
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    priority: Mapped[int] = mapped_column(Integer, default=0)
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    votes: Mapped[int] = mapped_column(Integer, default=0)
    views: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    author: Mapped[User | None] = relationship()


# --- BE-5: master profile ---


class MasterProfile(Base):
    """Профиль мастера (BE-5): слоган, город, опыт, услуги, оборудование,
    портфолио, B2B-опции и контакты мастерской. Один профиль на компанию.
    """

    __tablename__ = "master_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id"), unique=True, index=True
    )
    tagline: Mapped[str] = mapped_column(String(255), default="")  # слоган мастера
    city: Mapped[str] = mapped_column(String(120), default="")
    since: Mapped[int] = mapped_column(Integer, default=0)  # год начала работы
    experience: Mapped[list] = mapped_column(JSON, default=list)  # [{year, title, desc}] таймлайн
    services: Mapped[list] = mapped_column(JSON, default=list)  # [str] услуги/навыки
    arsenal: Mapped[list] = mapped_column(JSON, default=list)  # [{name, note}] оборудование
    portfolio: Mapped[list] = mapped_column(JSON, default=list)  # [{title, desc}] работы
    b2b: Mapped[list] = mapped_column(JSON, default=list)  # [str] B2B-опции (опт/поставки)
    contacts: Mapped[list] = mapped_column(JSON, default=list)  # [{type, value}] phone/telegram/email
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    company: Mapped[Company | None] = relationship()
