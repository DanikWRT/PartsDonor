# I2 (ЮKassa Безопасная сделка + вебхуки) — сохранённая работа из карда B7

Во время карда B7 (reviews) исполнитель Pi сверх задания реализовал целый блок I2
(ЮKassa). B7 строго про отзывы, поэтому этот блок **вычищен из deliverables B7**,
чтобы не смешивать две фичи и не конфликтовать с картой I2. Он сохранён здесь,
чтобы карта I2 могла поднять готовую работу вместо написания с нуля.

## Что здесь
- `yookassa_client.py` — ЮKassa-клиент: create_safe_deal_payment, verify_webhook_signature
  (HMAC-SHA256 constant-time), sender_ip_allowed (подсети ЮKassa), parse_notification,
  тестовый режим (settings.yookassa_test_mode).
- `main_i2_block.py` — вырезанный раздел из `backend/app/main.py`: эндпоинты
  `POST /deals/{deal_id}/pay` и `POST /webhooks/yookassa` + обработчик `_on_payment_succeeded`
  (перевод сделки created→escrow_paid, escrow created→paid).
- `schemas_i2_block.py` — схемы `DealPayIn/DealPayOut/WebhookAck`.

## Что ещё было нужно для I2 (Pi добавил и было вычищено)
- `config.py`: `yookassa_notification_secret`, `yookassa_test_mode`, `yookassa_base_url`.
- Импорты в main.py: `from app.config import settings`, `Request`, `status`,
  `from app.yookassa_client import new_payment_id, yookassa`.

## Важно для карты I2
- Работа основывается на новой модели Deal (seller_company_id, transitions-история,
  10-значный enum deal_status, escrow_status enum) — карта I2 должна строиться на ней
  (соответствует notes карты B6).
- В current B7-main.py НЕ вызов create_safe_deal_payment в create_deal; вебхук найден
  по `Deal.yookassa_payment_id`. При сборке I2: вернуть импорты и раздел (см. выше),
  восстановить блок из main_i2_block.py, схемы и yookassa_client.py в app/, поля в config.py.
- ЮKassa ждёт HTTP 200 от вебхука; иначе шлёт повторно 24ч.
