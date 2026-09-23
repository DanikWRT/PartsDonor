# Task B6 brief: Сделки + escrow статусная машина

Assignee: pi (headless, wormsoft / deepseek-ai/deepseek-v4-pro)
Repo: /home/aifactory/PartsDonor
Backend: FastAPI in `backend/app/`. Live now: backend 127.0.0.1:8001, Postgres 127.0.0.1:5433, InvenTree 127.0.0.1:8000.

## Goal
Дописать backend-модуль сделки: создать/полный CRUD сделки, статусную машину
жизненного цикла с escrow-статусом (заготовка под ЮKassa «Безопасная сделка»).
Acceptance: смена статусов валидна, эндпоинты работают, curl-тест жизненного цикла
доказательно пройден (реальный вызов, не «по-идее»).

## Состояния сделки (уже есть в backend/app/models.py, enum DealStatus)
Используй существующий enum, дополни его новыми состояниями по спецификации задачи:
- created           — создана, ожидание escrow-оплаты
- escrow_paid       — деньги в эскроу (ЮKassa)   [спека: escrow-оплата]
- seller_confirmed  — продавец подтвердил [спека: подтверждение продавцом]
- shipped           — отгружено (СДЭК)
- delivered         — получено покупателем [спека: получение]
- buyer_confirmed   — покупатель подтвердил получение [спека: подтверждение]
- payout            — выплата продавцу [спека: выплата]
- completed         — завершено
- refunded          — возврат
- dispute           — спор

Задача B6 в спеке: создание → escrow-оплата → подтверждение продавцом →
отгрузка → получение → подтверждение(покупателем) → выплата.
(создание → escrow_оплата → продавец_подтвердил → отгружено → получено →
подтверждено → выплачено). Порядок валидных переходов — задать в состоянии машины.

## Что уже есть
- backend/app/models.py — класс Deal (listing_id, buyer/seller_company_id, status
  DealStatus, amount_rub, yookassa_payment_id, escrow_status str, sdek_order_uuid,
  sdek_tracking, created_at). Модель НЕ нужно делать заново — используй её.
- backend/app/schemas.py — DealOut (id, listing_id, status, amount_rub,
  yookassa_payment_id, escrow_status, sdek_order_uuid, sdek_tracking, created_at).
- backend/app/main.py — GET /deals, GET /deals/{id}. НЕТ POST/создания, НЕТ
  эндпоинта перехода статуса.
- Стиль кода: async SQLAlchemy 2.0 (Mapped/mapped_column), Pydantic v2 в schemas.py,
  роуты через APIRouter в main.py, ошибки через HTTPException, db: AsyncSession.
- Таблицы автосоздаются на startup (Base.metadata.create_all). Добавление новых
  enum-значений в существующую таблицу может потребовать drop/recreate таблицы deals
  (Postgres enum). Если мигрируешь enum — сделай безопасно: при изменении схемы
  пересоздай deals в ./data-pd/db через alembic или проще — DROP TABLE deals при
  разработке (данных по сделкам ещё нет). Почини так, чтобы backend поднимался и
  таблица соответствовала новым состояниям.

## Что сделать (deliverables)
1. Расширить DealStatus enum новыми состояниями (escrow_paid, seller_confirmed,
   buyer_confirmed, payout — если их ещё нет) + completed/refunded/dispute уже есть.
2. Добавить в schemas.py: DealCreateIn (listing_id, buyer_company_id,
   seller_company_id, amount_rub), DealTransitionIn (from_status?, to_status / action),
   DealTransitionOut (старый+новый статус, ok). Поля под escrow: yookassa_payment_id,
   escrow_status — включи в создание/ответ.
3. Новой модуль backend/app/deal_machine.py (или в models/main) — статусная машина:
   валидные переходы, функция/класс validate_transition(from, to), недопустимый
   переход → 409/400 с сообщением. Продавец подтверждает после escrow_paid.
4. main.py: POST /deals (создание, стартовый статус created, escrow_status заготовка
   для ЮKassa напр. 'awaiting_payment'), POST /deals/{id}/transition
   (тело DealTransitionIn { to }, применяет переход, обновляет status и escrow_status,
   возвращает DealTransitionOut+DealOut). GET /deals/{id} уже есть — верни историю
   переходов (опционально, если просто — добавь поле transitions JSON к Deal или
   отдельную таблицу deal_events; выбери простое).
5. Обновить OpenAPI-доку автоматически (FastAPI сам).

## Acceptance (обязательно докажи curl-ом, реальный backend на 8001)
Протон жизненного цикла:
  1. POST /listings создать листинг (нужен listing_id; price>0) — вернёт UUID.
  2. POST /deals {listing_id, buyer_company_id, seller_company_id, amount_rub}
     → 201, status=created, escrow_status готов для ЮKassa.
  3. POST /deals/{id}/transition {to:"escrow_paid"} → ok, статус сменился.
  4. {to:"seller_confirmed"} → ok.
  5. {to:"shipped"} → ok.
  6. {to:"delivered"} → ok.
  7. {to:"buyer_confirmed"} → ok.
  8. {to:"payout"} → ok (escrow_status='payout_pending'/'released').
  9. {to:"completed"} → ok.
  + Доказать что НЕВАЛИДНЫЙ переход (напр. created→completed или shipped→created)
    возвращает 4xx с внятным сообщением.
Сохрани полный curl-лог (команды+ответы) в docs/b6-curl-lifecycle.log и краткое резюме
в docs/b6-result.md. Файлы писать в репозиторий /home/aifactory/PartsDonor/docs/.

## Стиль/правила
- Async SQLAlchemy (await db.commit/refresh/get). Не менять изобретённое без нужды.
- Комментарии/docstring на русском, краткие. Следовать существующему стилю файлов.
- Не трогать frontend. Только backend/app + schemas + models + docs.
- Не коммитить и не пушить. Оставляй изменения в рабочем дереве.
- После правок перезапусти backend (он live) и проверь /docs отдаёт новые эндпоинты.
