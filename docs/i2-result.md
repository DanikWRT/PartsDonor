# I2 — ЮKassa Безопасная сделка (платёжные webhooks): итог

## Статус
✅ Готово. Acceptance доказан живым acceptance-тестом `backend/_i2_verify.py`
на backend 127.0.0.1:8001 (18/18 PASS). Закоммичено.

## Что сделано

### Новый модуль `backend/app/yookassa_client.py`
- `YookassaClient` — REST-клиент ЮKassa API v3 (HTTP Basic Auth shopId+secret,
  httpx, идемпотентность через Idempotence-Key).
- `create_safe_deal_payment()` — создание платежа «на холд» (Безопасная сделка):
  amount + capture:true + deal.settlements[payout] + metadata с partsdonor_deal_id.
  В тестовом режиме без ключей магазина возвращает синтетический объект платежа
  той же формы (test=true) — интеграцию можно прогнать без живого магазина.
- `verify_webhook_signature(raw_body, sig, secret)` — проверка HMAC-SHA256 (base64)
  по сырому телу уведомления на секрете уведомлений, constant-time (hmac.compare_digest).
- `sender_ip_allowed(ip)` — IP-фильтр отправителя по официальным подсетям ЮKassa
  (185.71.76.0/27, 77.75.153.0/25, 77.75.156.11/35, 77.75.154.128/25, 2a02:5180::/32);
  в тестовом режиме дополнительно допускает loopback для локальных прогонов.
- `parse_notification(body)` — валидация формы {type: notification, event, object}.
- `new_payment_id()` — идемпотентный id платежа (UUID).

### Конфиг (`backend/app/config.py`)
- Добавлены `yookassa_shop_id`, `yookassa_secret_key`, `yookassa_notification_secret`,
  `yookassa_test_mode` (default true), `yookassa_base_url` (api.yookassa.ru/v3).

### Схемы (`backend/app/schemas.py`)
- `DealPayIn` (return_url), `DealPayOut` (payment_id, deal_id, status, confirmation_url, test),
  `WebhookAck` (received, event, payment_id, processed).

### Эндпоинты (`backend/app/main.py`)
- `POST /deals/{deal_id}/pay` — создаёт платёж ЮKassa на холд, сохраняет
  `yookassa_payment_id` в сделку, отдаёт платёжную форму/confirmation_url.
  Только для сделки в статусе created.
- `POST /webhooks/yookassa` — принимает уведомления ЮKassa:
  1) проверка IP отправителя по подсетям ЮKassa (403 иначе),
  2) проверка HMAC-подписи тела на секрете уведомлений (400 иначе),
  3) событие `payment.succeeded` -> сделка по yookassa_payment_id переводится
     `created -> escrow_paid`, escrow_status `created -> paid`, переход пишется
     в transitions-историю (source=yookassa_webhook, payment_id). Идемпотентно:
     повторный вебхук на уже оплаченной сделке ничего не ломает.

## Acceptance (живой backend, 18/18 PASS)

| Шаг | Проверка | Результат |
|-----|----------|-----------|
| 1 | POST /deals (status=created, escrow=created) | 201 |
| 2 | POST /deals/{id}/pay -> платёж на холд (test=true, payment_id сохранён) | 201 |
| 3 | deal.yookassa_payment_id == payment_id | ✓ |
| 4 | вебхук payment.succeeded с ВЕРНОЙ HMAC-подписью | 200 processed=true |
| 5 | deal.status created -> escrow_paid | ✓ |
| 6 | deal.escrow_status created -> paid | ✓ |
| 7 | переход помечен source=yookassa_webhook | ✓ |
| 8 | вебхук с НЕВЕРНОЙ подписью | 400 «Invalid signature» |
| 9 | вебхук без подписи | 400 «Invalid signature» |
| 10 | повторный вебхук (идемпотентность), статус не портится | ✓ |

Регрессия B6 (статусная машина сделок) — перепрогнана: `_b6_verify.py` 16/16 PASS.

## Запуск
Уведомление с правильно подписанным телом:
```
POST /webhooks/yookassa
Host: 127.0.0.1:8001
Content-Type: application/json
X-Signature: <HMAC-SHA256 base64 тела на PARTSDONOR_YOOKASSA_NOTIFICATION_SECRET>
{ "type":"notification", "event":"payment.succeeded",
  "object": { "id":"<yookassa_payment_id>", "status":"succeeded", "paid":true,
               "amount": {"value":"7900.00","currency":"RUB"}, "test":true } }
```

## Коммит
Изменения закоммичены (по acceptance «закоммичено»). Файлы:
- backend/app/yookassa_client.py (новый)
- backend/app/main.py, backend/app/schemas.py, backend/app/config.py
- backend/_i2_verify.py (acceptance-тест)
- docs/i2-result.md

## Блокеры
Нет. Live-ключи ЮKassa не нужны — тестовый режим. При появлении shop_id/secret
и webhook-секрета поведение переключается на реальный API ЮKassa автоматически
(по конфигу), без изменения кода.
