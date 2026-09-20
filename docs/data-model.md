# PartsDonor — Датал-модель на основе InvenTree (проверено через API 1.5.5)

> Проверено фактически: InvenTree 1.5.5 развёрнут локально, API доступен (admin/admin123).
> Модели: Part, PartCategory, StockItem, StockLocation, Company, CompanyAddress, PurchaseOrder,
> SalesOrder, BOM, Attachment, Search — работают. Создание/CRUD через REST OK.

## Принцип: InvenTree = ядро инвентаря, PartsDonor = маркетплейс-слой поверх

Мы НЕ переделываем InvenTree и НЕ пишем каталог с нуля. InvenTree хранит
«что есть на складе каждой мастерской», а PartsDonor добавляет торговый слой
(витрина, донорская развёртка, сделки, оплата, доставка).

## Сопоставление сущностей InvenTree ↔ PartsDonor

| Понятие PartsDonor | Сущность InvenTree | Комментарий |
|---|---|---|
| Мастерская (продавец/покупатель) | **Company** | + CompanyAddress (адреса доставки) |
| Запчасть-компонент (экран, плата, АКБ...) | **Part** | категория, фото, параметры, цены |
| Категория запчасти (Дисплей, Платы...) | **PartCategory** | дерево категорий |
| Конкретный экземпляр на складе | **StockItem** | кол-во, локация, статус |
| Склад/«коробка под столом» мастерской | **StockLocation** | локация = филиал мастерской |
| **Донор** (битое устройство, разбираемое на компоненты) | **Part** (родитель) + BOM | донор = Part с дочерними Part через BOM |
| История происхождения детали | кастомные поля / параметры Part | «снято с донора X, IMEI/серийник» |
| Развёртка телефона (кликабельная схема) | наш слой: hotspot ↔ Part | @cloudimage/hotspot, хранение JSON в БД |
| Сделка продажи мастерская→мастерская | **SalesOrder** + **PurchaseOrder** | связать PO и SO для пары |
| Фото деталей | **Attachment** | загрузка/просмотр |
| Статус «в наличии / продано / на продаже» | статусы StockItem + наш кастомный | маркетплейс-статус отдельно |

## Модель «Донор как BOM» (ядро идеи)

Донор = **Part-родитель** с дочерними Part (компонентами) через BOM:

```
Part: «iPhone 13 Pro — донор»  (category=Доноры)
 ├─ Part: «Дисплей»       (category=Дисплеи)  — BOM quantity=1, цена, фото
 ├─ Part: «Материнская плата» (category=Платы) — BOM quantity=1
 ├─ Part: «Аккумулятор»    (category=АКБ)
 ├─ Part: «Основная камера» (category=Камеры)
 └─ Part: «Корпус»         (category=Корпусные)
```

**Как это ложится на развёртку:** у Part-донора хранится изображение телефона
(Attachment) + JSON-маппинг хотспотов (наш слой): `{display: {x, y}, board: {x,y}, ...}`
каждый хотспот указывает на дочерний Part. Так «клик по развёртке» сразу показывает
деталь (фото, цена, статус). Статусы партятаются из StockItem каждого дочернего Part.

**Преимущества:** вся анатомия устройства (состав, совместимость, количество) живёт
в InvenTree как стандартный BOM — поиск, отчёты, инвентарь работают «из коробки».
Наш слой добавляет только визуальную карту (hotspot→part).

## Добавить в наш слой (custom-сущности PartsDonor поверх InvenTree)

Эти сущности НЕ в InvenTree, их создаём в своей БД (PostgreSQL рядом), ссылаясь на Part/StockItem id из InvenTree:

1. **device_schema** — модель телефона + её развёртка: device_id, brand/model, exploded_view_image, hotspots JSON, part_id (какой Part-донор это представляет).
2. **listing** — «объявление» на витрине: part_id (StockItem), seller_company_id, price, currency, status (active/sold/hidden), история происхождения (текст + фото).
3. **deal** — сделка: buyer_company, seller_company, listing, payment (ЮKassa безопасная сделка id, статус), shipping (СДЭК), escrow, dispute-статус.
4. **review / rating** — рейтинг продавца/покупателя (доверие для б/у).

## Схема сделки (B2B, безопасно)

```
Buyer(компания) ──▶ PartsDonor (наш слой)
      ▼
  ЮKassa «Безопасная сделка» (эскроу, от 0,4%, заморозка до 3 мес)
   деньги НЕ проходят через платформу
      │
      ▼
  СДЭК API (доставка) / Почта (резерв малых городов)
      │
  Buyer подтверждает получение → деньги продавцу; спор → возврат/арбитраж
```

Возвраты: между ИП/ООО ЗоЗПП не действует → только ГК РФ за скрытые дефекты.
Статус детали обязателен: «рабочая / на запчасти / без гарантии».

## Рекомендуемый стек-факт (подтверждено)

- **InvenTree** — инвентарь (Part/StockItem/BOM/Company/Order). REST API работает.
- **@cloudimage/hotspot** — вьювер развёртки; **react-image-hotspot-viewer** — редактор.
- **Свой слой** — PostgreSQL + FastAPI + React (mobile-first), юзает InvenTree API по part_id.
- **ЮKassa «Безопасная сделка»** (эскроу) + **СДЭК API** + Почта.

## Стек custom-слоя: итог ресерча (факты, не «по привычке»)

> Ресерч: ЮKassa/InvenTree/СДЭК SDK, бенчмарки стеков, очереди, frontend, БД.

**Backend: FastAPI (Python). Frontend: Vite + React (SPA/PWA). БД: отдельная собственная PostgreSQL + Redis (очереди/вебхуки).**

### Почему FastAPI (а не Node/Go) — факты
- **Официальные SDK ЮKassa только PHP+Python.** Python — first-class. Для критического пути (Безопасная сделка) это решающее. Node/Go — только сторонние не проверенные вендором клиенты.
- **Официальный Python SDK InvenTree** (`pip install inventree`) — классовый интерфейс к API. Для Node/Go готового клиента нет (писать HTTP-слой вручную).
- **Плагинный путь отступления**: InvenTree AppMixin — если REST узкое место, можно добавить custom Django-модели/endpoint на Python. Команда JS/Go отрезана от этой возможности.
- **Производительность**: для I/O-bound CRUD маркетплейса разница Go/Nest/FastAPI несущественна (~10% на CRUD). Наш слой — I/O-bound (REST к InvenTree, ЮKassa, СДЭК, вебхуки).
- NestJS — хорош, только если команда именно на JS/TS; тогда все SDK сторонние и интеграция с ядром вручную.

### Почему Vite + React (не Next.js)
- PartsDonor — mobile-first marketplace за авторизацией, SEO/SSR не нужны → Vite+React быстрее и легче. Next.js — только если появится публичный SEO-каталог.

### Почему отдельная БД (не в InvenTree)
- Модели InvenTree — «danger zone»: добавление своих моделей внутрь ломает миграции при обновлении.
- Торговый домен (сделки, эскроу, платежи, доставка) — отдельная ответственность, свой control и Alembic-миграции.

### Итоговый стек
```
Backend: FastAPI + uvicorn, async SQLAlchemy/Pydantic
   InvenTree: официальный inventree SDK
   Платежи: yookassa-sdk-python (Безопасная сделка)
   Доставка: cdek SDK или прямой HTTP к API 2.0
   Очереди: Celery/ARQ на Redis (вебхуки, выплаты)
Frontend: Vite + React (mobile-first SPA/PWA)
БД: отдельная PostgreSQL (торговый домен) + Redis (очереди)
Инвентарь: InvenTree как source of truth, интеграция по REST API
```

## Риски / открытые вопросы (зафиксировать)

- InvenTree 1.x использует свой `ApiToken` (не DRF) — токен получили через django shell (`users.models.ApiToken`), в API — `Authorization: Token <key>`.
- Нужно решить: хранить ли маркетплейс-статус продажи внутри InvenTree (custom status) или в нашем слое (рекомендуется — в нашем, чтобы не мутить каталог).
- Мульти-филиальность одной мастерской: StockLocation на филиал.
- Верификация продавца (Company с проверенными реквизитами) — как Tradeloop, для доверия б/у.
