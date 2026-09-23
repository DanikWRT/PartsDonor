# PartsDonor F4 — Кабинет покупателя: корзина / заказ / отслеживание (адаптив)

Собери frontend-модуль «ЛК покупателя» в Vite/React-приложении PartsDonor.
Backend уже ЖИВОЙ на 127.0.0.1:8001 (FastAPI), frontend dev на 127.0.0.1:5173
(vite proxy: /api/* -> backend без префикса /api).

## Что уже есть (не ломать)
- `frontend/src/App.jsx` — роуты: Catalog(/), PartDetail(/part/:id), DonorView, Cabinet(/cabinet — это Кабинет ПРОДАВЦА), Deal(/deal, /deal/:id).
- `frontend/src/pages/Cabinet.jsx` — образец стиля/реализации кабинета (следуй его паттерну: useState/useEffect, fetch('/api/...'), Бейджи, fmtMoney, адаптив-классы `.pd-*`).
- `frontend/src/styles.css` — все классы `.pd-*` уже есть (pd-cabinet, pd-widgets, pd-widget, pd-list, pd-listings, pd-deals, pd-deal-row, pd-badge-status-*, pd-btn, pd-form, pd-input, media-запросы 768/1100/1440). ДОБАВЛЯЙ новые классы в тот же файл внизу, не удаляя существующие.
- Backend эндпоинты (живые):
  * GET /listings?status=active  — активные объявления (id, title, price_rub, condition, provenance, status, seller_id, inventree_part_id)
  * POST /deals  body: {listing_id, buyer_company_id, amount_rub, shipping_address} -> создаёт сделку статус created, листинг уходит в negotiated. Отвечает DealOut.
  * GET /deals  — все сделки (id, listing_id, buyer_company_id, status, amount_rub, escrow_status, sdek_tracking, sdek_order_uuid, shipping_address, created_at)
  * PATCH /deals/{id}/status  body: {status} — статусная машина: created->paid_escrow->shipped->delivered->completed (плюс refunded, dispute). escrow_status меняется автоматически.
  * GET /companies — мастерские. Есть buyer «ЧиниМир» (id=fae3960e-e85e-4e31-b994-892ac4809119, role=buyer) и seller «СмартРемонт».

## Задача: создать страницу «Кабинет покупателя» с 3 разделами = корзина, заказ/чек-аут, отслеживание. Адаптив.

### 1. Корзина (client-side, localStorage)
Backend НЕ имеет сущности корзины/order. Поэтому корзина — фронтовое состояние в localStorage:
- Создай React-контекст `CartContext` (+ хук `useCart`) в `frontend/src/cart.jsx`.
  API: `items` (массив объектов listing: {id, inventree_part_id, title, price_rub, condition, seller_name}), `count`, `total`, `add(item)`, `remove(id)`, `clear()`, `has(id)`.
  - При добавлении — по id дедупликация (если уже есть, не дублировать).
  - Персист в localStorage под ключом `pd-cart` (инициализация из него, запись на каждый change).
- Подключи `CartProvider` в `App.jsx` ВОКРУГ всего приложения (оберни `<div className="pd-app">`).
- В шапку (`<header>`) добавь ссылку «Корзина» на `/buyer` с бейджем количества: `<NavLink to="/buyer">Корзина{count>0?` (${count})`:''}</NavLink>`. count из useCart — поэтому шапку нужно вынести в компонент, который сидит ВНУТРИ CartProvider (иначе будет undefined). Если App.jsx сам использует useCart — он уже внутри провайдера, ок.

### 2. Кнопка «В корзину» в каталоге и карточке
- В `Catalog.jsx` карточке `.pd-card` добавь рядом кнопку/ссылку «В корзину» (класс `pd-btn pd-btn-sm`), внутри карточки (не ломай Link-навигацию — карточка это Link; для кнопки используй событие stopPropagation/preventDefault ИЛИ добавь кнопку отдельным элементом вне Link). Лучше: в `.pd-card-body` добавь `<button className="pd-btn pd-btn-sm pd-add-cart">В корзину</button>` с `onClick={(e)=>{e.preventDefault(); e.stopPropagation(); add({id:i.listing_id,...}})`. Данные для корзины: i.listing_id (может быть null — тогда кнопку не показывай), i.name (title), i.listing_price, i.listing_condition, i.seller_name. Кнопку показывай только если есть listing_id и listing_price.
- В `PartDetail.jsx` — в блок предложений `.pd-offer` и/или в ценовой блок добавь кнопку «В корзину» для best-предложения (listing_id бэст-оффера). Состояние добавленного -> «✓ В корзине» (disabled).

### 3. Страница «Кабинет покупателя» `/buyer`
Создай `frontend/src/pages/BuyerCabinet.jsx`. Структура по образцу Cabinet.jsx:
- Три таба/раздела (как `.pd-tabs/.pd-tab`): «Корзина», «Заказы», «Отслеживание». Либо один экран с секциями. Выбери аккуратный адаптивный вариант.
- **Корзина**:
  * Список позиций: title, цена, состояние, продавец, кнопка «Убрать».
  * Итог: сумма (fmtMoney, то же форматирование «X ₽»), количество.
  * Форма заказа: адрес доставки (`shipping_address`, textarea инпут).
  * Кнопка «Оформить заказ»: для каждой позиции вызывает `POST /deals` {listing_id, buyer_company_id: БАЙЕР_ID (fae3960e-e85e-4e31-b994-892ac4809119), amount_rub: price_rub, shipping_address}. buyer_company_id возьми из GET /companies по role==='buyer' (загрузи при монтировании, не хардкодь id — но можно зафолбэчить на «ЧиниМир» по имени). После успешных всех POST: `clear()` корзину, показать сообщение об успехе, обновить список сделок.
  * При ошибке одного из листингов (напр. уже sold/negotiated) — показать ошибку и НЕ убирать остальные.
- **Заказы / отслеживание сделки**:
  * `GET /deals`, отфильтруй по buyer_company_id===buyer.id. Отсортируй по created_at desc.
  * Для каждой сделки: сумма, статус сделки (бейдж `pd-badge-status-{status}`), escrow (бейдж), название листинга (подтяни из GET /listings по listing_id или из корзины — проще: GET /listings и мапи по id), адрес доставки, дата создания, трекинг SDEK если есть (sdek_tracking — показать как «Трек-номер: <sdek_tracking>», если null — «—»).
  * Прогресс сделки: нарисовать шаги (Заказ -> Оплата/эскроу -> Отправка/доставка -> Получено/завершено) с подсветкой текущего статуса по статусной машине (created=шаг1, paid_escrow=шаг2, shipped/delivered=шаг3, completed=шаг4). Используй маппинг статус->этап.
  * Действие Покупателя: на статусе created показать кнопку «Оплатить» -> `PATCH /deals/{id}/status {status:'paid_escrow'}` (это покупатель вносит в эскроу). На delivered — «Подтвердить получение» -> {status:'completed'}. Это поку-pательные шаги статусной машины. После PATCH обнови состояние из ответа.

### 4. Адаптив
- Мобильный (390px): один столбец, нет горизонтального переполнения.
- Desktop (1440px): таблица/карточки сделок в 2 колонки, корзина — список + боковой блок итога (grid). Используй существующие media-запросы, добавляй новые классы с брейкпоинтами 768/1100.
- Проверь через браузер что 390px и 1440px не переполняются.

## Критерии приёмки (обязательно проверить)
1. `npm run build` в frontend — exit 0.
2. Каталог: на активных листингах есть кнопка «В корзину»; клик добавляет, бейдж в шапке растёт, localStorage сохраняется.
3. `/buyer`: добавленные позиции видны в Корзине; с указанием адреса «Оформить заказ» создаёт сделки (POST /deals -> 201), корзина пустеет, сделки появляются в «Заказах» со статусом created.
4. В «Заказах» виден прогресс (шаг 1) и статус «Создана»; кнопка «Оплатить» переводит в paid_escrow (PATCH -> 200, escrow_status=paid).
5. Скриншоты: мобильный 390px и десктоп 1440px страницы `/buyer` (и, если сделал кнопку в каталоге — скрин каталога с кнопкой).

## Процесс
- НЕ трогай backend, НЕ трогай Cabinet.jsx продавца.
- Файлы: создай `frontend/src/pages/BuyerCabinet.jsx`, `frontend/src/cart.jsx`; правь `frontend/src/App.jsx`, `frontend/src/pages/Catalog.jsx`, `frontend/src/pages/PartDetail.jsx`, `frontend/src/styles.css`.
- Vite dev уже работает на 5173 (live-reload сам подхватит). Backend на 8001. Для скриншотов используй браузер-харнесс (как делали для F3): открывай http://127.0.0.1:5173/buyer вьюпортах 390x844 и 1440x900.
- Удали этот файл-бриф после завершения.
