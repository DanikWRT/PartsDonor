# PartsDonor S-1 spec: линия «Доноры целиком» (скоуп R1)

## Цель (R1)
На базе готового MVP (каталог/листинги/сделки/развёртка F7 + UX-4 2D-чертёж/hotspot)
добавить линию «Доноры целиком»: продажа/покупка ЦЕЛОГО разобранного смартфона
(донор-комплект) с интерактивной развёрткой и возможностью торга/заявки.

## ACCEPTANCE (обязательно всё)
1. На каталоге есть раздел/фильтр «Доноры» (переключатель «Детали» | «Доноры целиком»).
2. Карточка донора с интерактивной развёрткой (exploded view) и кнопкой «Купить целиком».
3. Сделка на донор-комплект: «Купить целиком» создаёт Deal (в т.ч. с escrow/ЮKassa, как в 1-click).
4. Торг/заявка: покупатель может оставить заявку/предложение цены на донор; продавец видит заявки.

## Уже проверенные факты окружения (НЕ перепроверять)
- InvenTree жив на 0.0.0.0:8000; PartsDonor backend — uvicorn app.main:app на 127.0.0.1:8001 (workers 4);
  vite dev на 0.0.0.0:5173, проксирует /api -> 8001. Править
  /home/aifactory/PartsDonor/backend/app/main.py — uvicorn НЕ в --reload, поэтому после правок
  backend нужно перезапустить. vite HMR подхватит фронт сам.
- Донор: DeviceSchema Apple/iPhone 13 Pro, inventree_donor_part_id=6.
  BOM донора id=6 даёт компоненты: display(1), board(2), battery(3), camera(4), backcover(5).
- Верифицированный продавец = Company(СмартРемонт, id=e6f223e6-7542-4e15-bdd5-86c87a3a6ce9, verified=True).
- Верифицированные покупатели для 1-click: UX1 Demo Buyer (id=50099156-0e43-4309-a9f0-051fc81f20bd),
  UX2 Demo Buyer (id=a24648df-3cbf-4ef5-a6f9-0e3f92779d4d) — обе verified=True и имеют buyer_profiles.
- Схемы: app/models.py (SQLAlchemy+alembic), app/schemas.py (Pydantic), app/main.py (роуты),
  app/auth.py (JWT: require_roles; frontend кладёт токен в localStorage 'pd-token', authFetch в frontend/src/auth.jsx).
- Миграции: alembic (migrations/), но при старте uvicorn также Base.metadata.create_all — новые ТАБЛИЦЫ
  создадутся сами после рестарта. НОВУЮ КОЛОНКУ в существующей таблице listings create_all НЕ добавит —
  нужен alembic. Используй alembic-миграцию.
- Механизм сделки: create_deal / one_click_deal в main.py. one_click_deal требует verified-компании +
  заполненный BuyerProfile (billing_payer_name/inn/default_address) и создаёт Deal + payment через
  yookassa.create_safe_deal_payment(new_payment_id()). Модель Deal требует listing_id NOT NULL.
- Слоты/развёртка: frontend/src/pages/DonorView.jsx >724 строк. ExplodedScheme + слои (DisplayLayer,
  BoardLayer, BatteryLayer, CameraLayer, BackcoverLayer), FlatDrawing (2D-чертёж для плоских),
  normalizeSlot(), isFlat(), SLOT_META, statusCls/statusText. Клик слоя -> DetailPanel (F7).

--------------------------------------------------------------
## ДИЗАЙН-РЕШЕНИЯ (зафиксированы, следуй им; придумывать своё не нужно)
--------------------------------------------------------------

### A. Данные (backend/app/models.py)
Добавь 2 таблицы + 1 колонку:

1) Таблица `donor_lots` — «донор-комплект» на продажу целиком:
   - id: UUID PK default uuid4
   - device_schema_id: UUID FK -> device_schemas.id (NOT NULL)  # даёт brand/model/hotspots/взрыв
   - seller_id: UUID FK -> companies.id
   - title: String(200)
   - price_rub: Float
   - condition: PartCondition enum
   - provenance: Text default ""
   - status: ListingStatus enum (переиспользуй) default active
   - created_at: DateTime server_default func.now()
   Дай relationship device_schema, seller (Company), requests (back_populates).

2) Таблица `donor_requests` — заявка/торг покупателя на донор-комплект:
   - id: UUID PK default uuid4
   - donor_lot_id: UUID FK -> donor_lots.id
   - buyer_company_id: UUID FK -> companies.id
   - seller_company_id: UUID FK -> companies.id (nullable)
   - amount_rub: Float          # предложение цены (ставка)
   - message: Text default ""   # комментарий покупателя
   - status: String(16) default "pending"  # pending|accepted|declined
   - created_at: DateTime server_default func.now()
   Дай relationship donor_lot (back_populates="requests"), buyer.

3) В `Listing` добавь колонку `donor_lot_id: Mapped[uuid.UUID | None] = mapped_column(
     UUID(as_uuid=True), ForeignKey("donor_lots.id"), nullable=True)` — «цельный» листинг донора,
   через который идёт сделка целиком (Deal требует listing_id).

### B. Миграция (alembic)
Создай alembic-миграцию, которая: создаёт таблицы donor_lots, donor_requests И добавляет
column donor_lot_id в listings. Назови revision с темой s1_donor_lots + donor_requests + listing.donor_lot_id.
Запусти `alembic upgrade head` ДО рестарта backend, чтобы колонка listings.donor_lot_id существовала.

### C. API (backend/app/main.py + schemas.py)
В app/schemas.py добавь модели (переиспользуй конвенции существующих):
- DonorLotIn: device_schema_id: uuid.UUID, title: str, price_rub: float gt=0,
  condition: PartCondition=untested, provenance: str=""
- DonorLotOut: id, device_schema_id, brand:str, model:str, donor_part_id:int|None,
  title, price_rub, condition, provenance, status, seller_name|None, seller_rating|None,
  seller_verified|bool|None, component_count:int, listing_id:uuid|None, created_at
- DonorLotDetail(DonorLotOut): exploded_url:str, components: list[DonorComponent] (переиспользуй DonorComponent из schemas.py),
  requests: list[DonorRequestOut]|None=None  # заполнять только если запрашивающий — продавец
- DonorRequestIn: amount_rub: float gt=0, message: str=""
- DonorRequestOut: id, donor_lot_id, buyer_company_id, seller_company_id|None, amount_rub,
  message, status, created_at, buyer_name:str|None

Добавь роуты (в app/main.py):
1. GET /donor-lots?status=&brand=&model=&only_available= -> list[DonorLotOut]
   - select(DonorLot).options(selectinload DonorLot.seller, DonorLot.device_schema)
   - фильтры: status (ListingStatus), only_available (status==active),
     brand/model — по schema.brand / schema.model (ILIKE lowercase или точное).
   - component_count: посчитай по BOM донора в InvenTree (inventree.get_bom_subs(donor_part_id))
     — но НЕ блокируй список из-за сбоя InvenTree; при ошибке component_count=0.
   - listing_id: найди активный (или любой) Listing с donor_lot_id==lot.id.
2. GET /donor-lots/{id} -> DonorLotDetail
   - по id; если нет -> 404.
   - exploded: собери components как в GET /donor/{donor_part_id} (BOM донора + цены/статусы с
     listings по inventree_part_id) И подмешай hotspots из device_schema.hotspots. Верни DonorComponent[]
     с slot=длинное имя, title, part_id, price_rub, status, hotspot.
   - requests: если user (require_roles seller/admin) и user.company_id == lot.seller_id — верни список
     заявок; иначе None.
3. POST /donor-lots  (JWT: require_roles(seller, admin))
   - body DonorLotIn; seller_id = user.company_id (не доверяй телу). Проверь device_schema существует.
   - создай DonorLot(status=active). Верни DonorLotOut (201).
4. POST /donor-lots/{id}/request  (JWT: require_roles(buyer, admin))
   - body DonorRequestIn; buyer_company_id = user.company_id; seller_company_id = lot.seller_id.
   - если lot.status == sold -> 400 «Донор уже продан». Создай DonorRequest(status=pending).
   - Верни DonorRequestOut (201).
5. GET /donor-lots/{id}/requests  (JWT: seller/admin)
   - только если user.company_id == lot.seller_id (или admin). Верни list[DonorRequestOut].
6. POST /donor-lots/{id}/deals  (JWT: require_roles(buyer, admin)) — «Купить целиком»
   - Проверь lot существует; lot.status != sold. Компания verified + BuyerProfile заполнен (как в
     one_click_deal) -> иначе 400/403 c понятным текстом.
   - Найди активный Listing, у которого donor_lot_id == lot.id; если нет — СОЗДАЙ его:
     Listing(inventree_part_id=lot.device_schema.inventree_donor_part_id, donor_lot_id=lot.id,
     seller_id=lot.seller_id, device_schema_id=lot.device_schema_id, title=lot.title,
     price_rub=lot.price_rub, condition=lot.condition, provenance=lot.provenance, status=active).
   - Повтори логику one_click_deal: создай Deal(listing_id=whole_listing.id, buyer_company_id,
     seller_company_id=lot.seller_id, status=created, amount_rub=lot.price_rub, escrow=created,
     shipping_address=profile.default_address) + yookassa.create_safe_deal_payment(...).
     whole_listing.status -> negotiated; lot.status -> negotiated (донор уходит в переговоры).
   - Верни OneClickDealOut (переиспользуй схему) — 201.
   - Импорты: new_payment_id, yookassa, BuyerProfile — уже есть в main.py, переиспользуй.

### D. Frontend (frontend/)
1) Вынеси общую развёртку в shared-компонент: frontend/src/components/DonorExploded.jsx
   - Перенеси из DonorView.jsx: SLOT_META, statusCls, statusText, normalizeSlot, isFlat, все слои
     (Display/Board/Battery/Camera/Backcover/ShadowDef/SlotLayer), FlatDrawing, VIEW_*, ExplosionAxis,
     ExplodedScheme (принимает components с {slot,hotspot,status,title,price_rub} и onSelect/selectedKey,
     рисует кнопки .pd-flat-hotspot/.pd-layer-btn). Экспортируй ExplodedScheme, normalizeSlot, isFlat,
     SLOT_META, statusCls, statusText.
   - В DonorView.jsx замени эти определения на import из '../components/DonorExploded'. Поведение
     DonorView НЕ менять (без регрессий UX-4/F7). ExplodedScheme остаётся совместимым по пропсам.
     Классы .pd-* в CSS остаются те же (не переименовывай).
2) Новый экран «Доноры» — frontend/src/pages/DonorLots.jsx, роут /donor-lots (добавь в App.jsx).
   - Fetch GET /api/donor-lots. Grid карточек .pd-donor-card: brand/model, миниатюра развёртки
     (встроить ExplodedScheme в маленький контейнер, onSelect=noop), «Донор целиком», цена (ru-RU ₽),
     component_count деталей, продавец+рейтинг. Карточка -> Link to /donor-lot/{id}.
3) Новый экран донора — frontend/src/pages/DonorLot.jsx, роут /donor-lot/:id (добавь в App.jsx).
   - Fetch GET /api/donor-lots/{id}. Покажи: h2 brand/model; блок цены целиком + condition + provenance
     + продавец (рейтинг/verified); ExplodedScheme (интерактивный: клик слоя -> панель с инфо о детали —
     title/price/status под схемой или DetailPanel-подобная).
     - Кнопка «Купить целиком» -> POST /api/donor-lots/{id}/deals (authFetch). Если 201 —
       покажи payment.confirmation_url кнопкой «Перейти к оплате» + ссылку /deal/{deal_id}.
       Если 400/403 (не верифицирован/нет профиля) — покажи текст ошибки. Если нет токена — «Необходим вход».
     - Форма «Оставить заявку» (торг): поле amount_rub (₽) + message (textarea) ->
       POST /api/donor-lots/{id}/request (authFetch). Показать успех/ошибку.
     - Если user — продавец этого донора, покажи список заявок (GET /api/donor-lots/{id}/requests).
   - authFetch (JWT 'pd-token') уже есть в frontend/src/auth.jsx — используй.
4) Catalog.jsx: добавь переключатель «Детали» | «Доноры целиком» над фильтрами (.pd-donor-toggle).
   - «Детали» — текущий каталог (ничего не менять). «Доноры целиком» — встроить внутрь этой же
     страницы <DonorLots /> (импорт). Это даёт «раздел «Доноры» НА каталоге».
5) styles.css: добавь секцию /* S1: Доноры целиком */ — .pd-donor-* (toggle, card grid, card, цена,
   badge, миниатюра), переиспользуя токены pd-*. Адаптив: мобильный <=480px — карточки в 1 колонку,
   кнопки полноширинные, без горизонтального переполнения.
6) App.jsx: <Route path="/donor-lots" element={<DonorLots />} /> и
   <Route path="/donor-lot/:id" element={<DonorLot />} />.

### E. Seed для проверки
Скриптом (python, как _s1_probe.py, через async_session_factory) создай ДОНАТОР-ЛОТ для
Apple/iPhone 13 Pro: device_schema_id=a54da2f9-2873-4003-92d7-62180297d76d,
seller_id=e6f223e6-7542-4e15-bdd5-86c87a3a6ce9 (СмартРемонт), title="Донор iPhone 13 Pro (комплект)",
price_rub=38000, condition=for_parts, provenance="Полный донор, весь BOM в наличии", status=active.
Идемпотентно: если такой уже есть — не дублируй (проверь по device_schema_id+seller_id).

### F. Верификация (ОБЯЗАТЕЛЬНО, живая)
1. cd /home/aifactory/PartsDonor/backend && .venv/bin/alembic upgrade head -> exit 0.
2. Перезапусти backend: убей текущий uvicorn (pid по `ps aux | grep 'uvicorn app.main:app'`) и подними
   заново ровно той же командой (uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 4),
   проверь curl http://127.0.0.1:8001/health ok. (startup create_all создаст новые таблицы.)
3. cd /home/aifactory/PartsDonor/frontend && npm run build -> exit 0.
4. LIVE в playwright (chromium): http://127.0.0.1:5173/
   a) На каталоге виден переключатель «Детали» | «Доноры целиком»; «Доноры целиком» показывает
      карточку донора (мини-развёртка + цена + деталей N).
   b) Открыть /donor-lot/<lot_id>: развёртка рендерится (ExplodedScheme, .pd-layer-btn/.pd-flat-hotspot),
      видна цена целиком и кнопка «Купить целиком».
   c) Залогинься покупателем (UX2 Demo Buyer a24648df..., верифицирован, профиль есть; токен в
      localStorage 'pd-token' через /login ИЛИ POST /api/auth/login — посмотри как устроена авторизация).
      Нажми «Купить целиком» -> создаётся Deal: проверь GET /api/deals есть новый deal c listing donor lot;
      GET /api/donor-lots/{id} -> status negotiated; GET /api/listings — listing с donor_lot_id и status negotiated.
      Запиши deal_id.
   d) Торг: через форму «Оставить заявку» отправь amount_rub+message -> создан donor_request:
      проверь GET /api/donor-lots/{id} (как seller) или SQL — заявка есть, buyer_company_id верный, status pending.
   e) Адаптив: 400px и 1280px — нет горизонтального переполнения, развёртка и кнопки не ломаются.
   Запиши ВСЁ в backend/_s1_verify.log (шаг, PASS/FAIL, факты/DOM-метрики). Скриншоты в
   /home/aifactory/PartsDonor: pd-s1-donor-catalog-desktop.png, pd-s1-donor-catalog-mobile.png,
   pd-s1-donor-lot-desktop.png, pd-s1-donor-lot-mobile.png, pd-s1-deal-desktop.png.

## Отчёт (в финальном сообщении Pi)
Список изменённых файлов (backend+frontend), результат alembic upgrade + npm build,
все live-проверки PASS/FAIL, deal_id, скриншоты, путь к backend/_s1_verify.log, краткое описание
реализации (таблицы, роуты, фронт). Заверши clean: не коммить (коммит сделает оркестратор).
Файлы, которые не менял, не трогай. backend/_s1_seed.py и backend/_s1_verify.log обязательны.
