# ============================== ЮKASSA (Безопасная сделка) ==============================


@router.post("/deals/{deal_id}/pay", response_model=DealPayOut, status_code=status.HTTP_201_CREATED)
async def deal_pay(
    deal_id: uuid.UUID, payload: DealPayIn, db: AsyncSession = Depends(get_db)
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


