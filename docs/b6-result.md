# B6 — Сделки + escrow-статусная машина: итог

## Статус
✅ Задача выполнена полностью. Acceptance-тест жизненного цикла пройден на живом backend 127.0.0.1:8001.

## Что сделано

### Изменённые файлы
- `backend/app/models.py` — расширен enum `DealStatus` (добавлены `escrow_paid`,
  `seller_confirmed`, `buyer_confirmed`, `payout`; старый `paid_escrow` заменён на
  `escrow_paid`). В модель `Deal` добавлены поля `seller_company_id` (FK на companies)
  и `transitions` (JSON — история переходов), а также relationship `seller`.
- `backend/app/deal_machine.py` — НОВЫЙ модуль: таблица валидных переходов
  `TRANSITIONS`, маппинг `ESCROW_BY_DEAL` (статус сделки → escrow-статус ЮKassa),
  функция `validate_transition(from, to)` (недопустимый переход → `ValueError`).
- `backend/app/schemas.py` — добавлены `DealCreateIn` (listing_id, buyer_company_id,
  seller_company_id, amount_rub, yookassa_payment_id, shipping_address),
  `DealTransitionIn` (`to`, опционально `from_status`), `DealTransitionOut`
  (from_status, to_status, ok, deal). `DealOut` дополнен `seller_company_id` и
  `transitions`.
- `backend/app/main.py` — обновлён `POST /deals` (стартовый `created`,
  `escrow_status=created`, seller из payload/листинга, валидация компаний); добавлен
  `POST /deals/{id}/transition` (применяет переход через `validate_transition`,
  обновляет `status`/`escrow_status`, пишет запись в `transitions`, возвращает
  `DealTransitionOut`). Удалён старый `PATCH /deals/{id}/status`.
- `backend/_b6_migrate.py` — one-off миграция: дроп `deals`/`reviews` + enum
  `deal_status`, пересоздание таблиц/типов по новым моделям (dev, данных по сделкам нет).

### Миграция БД
Postgres enum `deal_status` пересоздан со значениями:
`created, escrow_paid, seller_confirmed, shipped, delivered, buyer_confirmed, payout, completed, refunded, dispute`.
Таблица `deals` пересоздана с колонками `seller_company_id` и `transitions` (JSON).

## Результат acceptance-теста (curl, живой backend)

Полный лог — `docs/b6-curl-lifecycle.log`. Жизненный цикл:

| Шаг | Переход | HTTP | Статус сделки | escrow_status |
|-----|---------|------|---------------|---------------|
| 1   | POST /listings | 200 | — | — |
| 2   | POST /deals | 201 | created | created |
| 3   | → escrow_paid | 200 | escrow_paid | paid |
| 4   | → seller_confirmed | 200 | seller_confirmed | in_progress |
| 5   | → shipped | 200 | shipped | in_progress |
| 6   | → delivered | 200 | delivered | in_progress |
| 7   | → buyer_confirmed | 200 | buyer_confirmed | in_progress |
| 8   | → payout | 200 | payout | released |
| 9   | → completed | 200 | completed | released |

Невалидные переходы (вернули `400` с внятным сообщением):
- `completed -> created` → 400 «Недопустимый переход статуса сделки: completed -> created»
- `created -> completed` → 400 «Недопустимый переход статуса сделки: created -> completed»

История переходов корректно накапливается в `transitions` (7 записей от created до
completed) и возвращается в `GET /deals/{id}`.

## OpenAPI
`/openapi.json` отдаёт новые эндпоинты: `POST /deals`, `POST /deals/{deal_id}/transition`
(проверено на живом `/docs`).

## Блокеры
Нет. Frontend не трогали, коммитов/пушей не делали.
