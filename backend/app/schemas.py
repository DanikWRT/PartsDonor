"""PartsDonor — Pydantic-схемы API (запросы/ответы)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models import BuyRequestStatus, BuyRequestType, BuyResponseStatus, DealStatus, EscrowStatus, ListingStatus, PartCondition, MessageKind, OfferStatus


# --- Company (мастерская / продавец) ---


class CompanyIn(BaseModel):
    name: str
    inventree_company_id: int | None = None
    role: str = "seller"
    slug: str | None = None
    verified: bool = False


class CompanyOut(BaseModel):
    id: uuid.UUID
    inventree_company_id: int | None
    name: str
    role: str
    slug: str | None
    rating: float
    verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- DeviceSchema (развёртка) ---


class HotspotIn(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class DeviceSchemaIn(BaseModel):
    brand: str
    model: str
    inventree_donor_part_id: int | None = None
    exploded_view_url: str = ""
    hotspots: dict[str, HotspotIn] = {}


class DeviceSchemaOut(BaseModel):
    id: uuid.UUID
    brand: str
    model: str
    inventree_donor_part_id: int | None
    exploded_view_url: str
    hotspots: dict[str, HotspotIn]
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Listing ---


class ListingIn(BaseModel):
    title: str
    price_rub: float = Field(gt=0)
    condition: PartCondition = PartCondition.untested
    provenance: str = ""
    inventree_part_id: int | None = None
    inventree_stock_id: int | None = None
    seller_id: uuid.UUID | None = None
    device_schema_id: uuid.UUID | None = None


class ListingUpdate(BaseModel):
    status: ListingStatus | None = None
    price_rub: float | None = Field(default=None, gt=0)
    condition: PartCondition | None = None


class ListingOut(BaseModel):
    id: uuid.UUID
    inventree_part_id: int | None
    inventree_stock_id: int | None
    seller_id: uuid.UUID | None
    device_schema_id: uuid.UUID | None
    part_name: str | None = None
    part_category: str | None = None
    title: str
    price_rub: float
    condition: PartCondition
    provenance: str
    status: ListingStatus
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Deal ---


class DealCreateIn(BaseModel):
    listing_id: uuid.UUID
    buyer_company_id: uuid.UUID
    seller_company_id: uuid.UUID | None = None
    amount_rub: float = Field(gt=0)
    yookassa_payment_id: str | None = None
    shipping_address: str = ""


class DealTransitionIn(BaseModel):
    to: DealStatus  # целевой статус сделки
    from_status: DealStatus | None = None  # опционально: ожидаемый текущий статус


class DealOut(BaseModel):
    id: uuid.UUID
    listing_id: uuid.UUID
    buyer_company_id: uuid.UUID | None
    seller_company_id: uuid.UUID | None
    status: DealStatus
    amount_rub: float
    currency: str
    yookassa_payment_id: str | None
    escrow_status: EscrowStatus
    sdek_order_uuid: str | None
    sdek_tracking: str | None
    shipping_address: str
    transitions: list[dict] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DealTransitionOut(BaseModel):
    from_status: DealStatus
    to_status: DealStatus
    ok: bool = True
    deal: DealOut


class DealPayIn(BaseModel):
    # куда ЮKassa вернёт пользователя после оплаты (платёжная форма redirect)
    return_url: str = Field(default="https://partsdonor.local/pay/success")


class DealPayOut(BaseModel):
    payment_id: str
    deal_id: uuid.UUID
    status: str              # статус объекта платежа ЮKassa
    confirmation_url: str | None = None
    test: bool               # тестовый режим


class BuyerProfileIn(BaseModel):
    billing_payer_name: str = ""
    billing_inn: str = ""
    default_address: str = ""


class BuyerProfileOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    billing_payer_name: str
    billing_inn: str
    default_address: str
    created_at: datetime

    model_config = {"from_attributes": True}


class OneClickDealIn(BaseModel):
    listing_id: uuid.UUID


class OneClickDealOut(BaseModel):
    deal: DealOut
    payment: DealPayOut | None = None
    billing_payer_name: str
    billing_inn: str
    delivery_address: str


class WebhookAck(BaseModel):
    """Ответ на вебхук ЮKassa: HTTP 200 = принято (иначе ЮKassa шлёт повторно 24ч)."""
    received: bool
    event: str | None = None
    payment_id: str | None = None
    processed: bool = False


# --- Review ---


class DonorLotIn(BaseModel):
    device_schema_id: uuid.UUID
    title: str
    price_rub: float = Field(gt=0)
    condition: PartCondition = PartCondition.untested
    provenance: str = ""


class DonorLotOut(BaseModel):
    id: uuid.UUID
    device_schema_id: uuid.UUID
    brand: str
    model: str
    donor_part_id: int | None
    title: str
    price_rub: float
    condition: PartCondition
    provenance: str
    status: ListingStatus
    seller_name: str | None
    seller_rating: float | None
    seller_verified: bool | None
    component_count: int
    listing_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DonorLotDetail(DonorLotOut):
    exploded_url: str
    donor_image: str | None = None
    components: list[DonorComponent]
    requests: list["DonorRequestOut"] | None = None


class DonorRequestIn(BaseModel):
    amount_rub: float = Field(gt=0)
    message: str = ""


class DonorRequestOut(BaseModel):
    id: uuid.UUID
    donor_lot_id: uuid.UUID
    buyer_company_id: uuid.UUID
    seller_company_id: uuid.UUID | None
    amount_rub: float
    message: str
    status: str
    created_at: datetime
    buyer_name: str | None

    model_config = {"from_attributes": True}


# --- BE-1: wizard донора + photos/uploads ---


class PhotoOut(BaseModel):
    id: uuid.UUID
    owner_type: str
    owner_id: uuid.UUID
    url: str
    sort: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DonorPartIn(BaseModel):
    slot: str = ""
    title: str = ""
    inventree_part_id: int | None = None
    price_rub: float = 0
    status: str = "active"
    sort: int = 0


class DonorPartOut(BaseModel):
    id: uuid.UUID
    donor_id: uuid.UUID
    slot: str
    title: str
    inventree_part_id: int | None
    price_rub: float
    status: str
    sort: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DonorIn(BaseModel):
    """Создание донора (шаг 1 wizard): можно сразу передать состав частей."""

    device_schema_id: uuid.UUID | None = None
    brand: str = ""
    model: str = ""
    title: str = ""
    price_rub: float = 0
    condition: PartCondition = PartCondition.untested
    provenance: str = ""
    parts: list[DonorPartIn] = []


class DonorUpdate(BaseModel):
    """Обновление полей донора (шаги 2-4 wizard)."""

    device_schema_id: uuid.UUID | None = None
    brand: str | None = None
    model: str | None = None
    title: str | None = None
    price_rub: float | None = None
    condition: PartCondition | None = None
    provenance: str | None = None
    status: str | None = None  # draft|published|archived (ручное переключение допускаем)


class DonorOut(BaseModel):
    id: uuid.UUID
    seller_id: uuid.UUID
    device_schema_id: uuid.UUID | None
    brand: str
    model: str
    title: str
    price_rub: float
    condition: PartCondition
    provenance: str
    status: str
    donor_lot_id: uuid.UUID | None
    part_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DonorDetail(DonorOut):
    parts: list[DonorPartOut] = []
    photos: list[PhotoOut] = []


class DonorPublishOut(BaseModel):
    """Результат публикации донора: создан DonorLot для витрины."""

    donor: DonorOut
    donor_lot_id: uuid.UUID | None
    message: str


class UploadOut(BaseModel):
    """Результат POST /uploads: фото сохранено + запись в photos."""

    photo: PhotoOut
    url: str


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5, default=5)
    comment: str = ""
    seller_id: uuid.UUID | None = None


class ReviewOut(BaseModel):
    id: uuid.UUID
    deal_id: uuid.UUID | None
    seller_id: uuid.UUID | None
    rating: int
    comment: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Subscription (UX-2: «Сообщить, когда появится») ---


class SubscriptionStatusOut(BaseModel):
    subscribed: bool
    part_id: int


class SubscriptionIn(BaseModel):
    inventree_part_id: int


class SubscriptionOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    inventree_part_id: int
    notified: bool
    notified_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationOut(BaseModel):
    """Уведомление = подписка с notified=True (одна на (company, part))."""

    id: uuid.UUID
    inventree_part_id: int
    part_name: str | None = None
    notified_at: datetime


# --- Каталог (из InvenTree + наши цены) ---


class CatalogItem(BaseModel):
    id: int                       # pk Part in InvenTree
    name: str
    category: str = ""
    is_assembly: bool = False
    in_stock: bool = False
    listing_price: float | None = None   # наша цена с лучшего active listing
    listing_status: str | None = None
    listing_condition: str | None = None  # состояние детали из листинга
    listing_provenance: str | None = None
    listing_warranty: bool | None = None  # гарантия на деталь (выводится из condition)
    listing_id: uuid.UUID | None = None
    seller_name: str | None = None
    seller_rating: float | None = None
    seller_verified: bool | None = None


class CatalogDetail(BaseModel):
    """Карточка детали: часть из InvenTree + все активные листинги + рейтинг продавца."""
    id: int
    name: str
    category: str = ""
    is_assembly: bool = False
    in_stock: bool = False
    description: str = ""
    image_url: str | None = None
    listings: list["CatalogListingOut"] = []
    min_price: float | None = None
    min_condition: str | None = None


class CatalogListingOut(BaseModel):
    id: uuid.UUID
    title: str
    price_rub: float
    condition: str
    provenance: str
    warranty: bool = False   # гарантия на деталь (условие != no_guarantee)
    status: str
    seller_name: str | None = None
    seller_rating: float | None = None
    seller_verified: bool | None = None


class DonorComponent(BaseModel):
    slot: str
    title: str = ""
    part_id: int | None = None
    price_rub: float = 0
    status: str = "active"
    hotspot: dict = {}
    image: str | None = None


class DonorSchema(BaseModel):
    brand: str
    model: str
    exploded_view_url: str
    components: list[DonorComponent]


# --- Прочее ---


class HealthOut(BaseModel):
    partsdonor_backend: str = "ok"
    inventree: bool
    inventree_base_url: str
    version: str = "0.2.0"

# --- BE-2: buy-requests ---


class BuyRequestIn(BaseModel):
    type: BuyRequestType
    brand: str
    model: str
    cond: str | None = None
    budget: float = Field(gt=0)
    urgent: bool = False
    city: str | None = None


class BuyRequestUpdate(BaseModel):
    cond: str | None = None
    budget: float | None = Field(default=None, gt=0)
    urgent: bool | None = None
    city: str | None = None
    status: str | None = None  # open|accepted|closed


class BuyRequestOut(BaseModel):
    id: uuid.UUID
    type: BuyRequestType
    brand: str
    model: str
    cond: str | None
    budget: float
    urgent: bool
    city: str | None
    buyer_id: uuid.UUID
    status: BuyRequestStatus
    created_at: datetime
    buyer_name: str | None

    model_config = {"from_attributes": True}


class BuyResponseOut(BaseModel):
    id: uuid.UUID
    buy_request_id: uuid.UUID
    seller_id: uuid.UUID
    message: str
    offer_price: float | None
    status: BuyResponseStatus
    created_at: datetime
    seller_name: str | None

    model_config = {"from_attributes": True}


class BuyRequestDetailOut(BuyRequestOut):
    responses: list[BuyResponseOut] = []


class BuyResponseIn(BaseModel):
    message: str = ""
    offer_price: float | None = None
    status: str | None = None  # accepted|rejected (for PATCH on response)


class BuyCountersOut(BaseModel):
    total_open: int
    urgent: int
    by_type: dict[str, int]
    by_status: dict[str, int]


# --- BE-3: chat (dialogs/messages/offers) ---


# --- Enums ---


# --- Schemas ---


class DialogCreateIn(BaseModel):
    participant_id: uuid.UUID
    listing_id: uuid.UUID | None = None
    donor_lot_id: uuid.UUID | None = None


class DialogParticipantOut(BaseModel):
    dialog_id: uuid.UUID
    user_id: uuid.UUID
    last_read_at: datetime | None

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: uuid.UUID
    dialog_id: uuid.UUID
    author_id: uuid.UUID
    kind: str
    body: str
    offer_id: uuid.UUID | None
    offer_status: str | None = None
    attachment_url: str | None
    created_at: datetime
    read: bool

    model_config = {"from_attributes": True}


class MessageSendIn(BaseModel):
    kind: str
    body: str | None = None
    offer_price: float | None = None
    attachment_url: str | None = None


class OfferOut(BaseModel):
    id: uuid.UUID
    dialog_id: uuid.UUID
    sender_id: uuid.UUID
    price_rub: float
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DialogOut(BaseModel):
    id: uuid.UUID
    listing_id: uuid.UUID | None
    donor_lot_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    unread_count: int
    last_message: MessageOut | None
    other_participant_id: uuid.UUID
    other_participant_name: str

    model_config = {"from_attributes": True}


class DialogDetailOut(DialogOut):
    participants: list[DialogParticipantOut]


class DialogReadOut(BaseModel):
    ok: bool = True

