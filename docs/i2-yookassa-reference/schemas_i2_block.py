class DealPayIn(BaseModel):
    # куда ЮKassa вернёт пользователя после оплаты (платёжная форма redirect)
    return_url: str = Field(default="https://partsdonor.local/pay/success")


class DealPayOut(BaseModel):
    payment_id: str
    deal_id: uuid.UUID
    status: str              # статус объекта платежа ЮKassa
    confirmation_url: str | None = None
    test: bool               # тестовый режим


class WebhookAck(BaseModel):
    """Ответ на вебхук ЮKassa: HTTP 200 = принято (иначе ЮKassa шлёт повторно 24ч)."""
    received: bool
    event: str | None = None
    payment_id: str | None = None
    processed: bool = False


