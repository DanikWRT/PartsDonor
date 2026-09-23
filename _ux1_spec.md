# PartsDonor UX-1: «Купить в 1 клик» для верифицированных B2B-покупателей

Repo: /home/aifactory/PartsDonor (branch master, git repo)
Backend venv: /home/aifactory/PartsDonor/backend/.venv
Backend: uvicorn app.main:app on 127.0.0.1:8001 (WAIT: currently running async version — DO NOT revert files inventree_client.py / main.py pre-existing uncommitted P0-1 async changes; work ON TOP of them)
DB: postgresql+asyncpg://pduser:pdpass@localhost:5433/partsdonor ; backend auto-creates tables with Base.metadata.create_all on startup (so a NEW table is created on restart; existing tables are NOT altered).
Frontend: vite dev at http://localhost (proxy /api -> 127.0.0.1:8001, strips /api). Files under frontend/src.
YooKassa: test_mode = True (synthetic payments, no real webhook needed).

## Goal (task t_2a5a079a)
A verified B2B buyer with saved «плательщик» (billing payer: org name + INN) and default delivery address can click «Купить в 1 клик» on a listing detail card and it creates the deal (escrow) in ONE action, using their saved default payer/address — no extra steps. ACCEPTANCE: verified buyer has «Купить в 1 клик» -> creates deal without extra steps; uses default payer/address.

## Backend changes

### 1. backend/app/models.py — new table BuyerProfile
Add class `BuyerProfile(Base)` (one profile per buyer company):
- id: uuid PK (default uuid4)
- company_id: Mapped[uuid.UUID] mapped_column(UUID, ForeignKey("companies.id"), unique=True, index=True)
- billing_payer_name: Mapped[str] = mapped_column(String(200), default="")   # наименование плательщика
- billing_inn: Mapped[str] = mapped_column(String(64), default="")           # ИНН плательщика
- default_address: Mapped[str] = mapped_column(Text, default="")            # адрес доставки по умолчанию
- created_at / updated_at (DateTime(timezone=True), server_default=func.now(); updated_at also onupdate=func.now())
- relationship company -> BuyerProfile (back_populates not required; keep simple: `company: Mapped[Company|None] = relationship()` on BuyerProfile is fine, or omit).
Keep all imports (already has Text, ForeignKey, UUID, func, mapped_column, relationship).

### 2. backend/app/schemas.py — new schemas
- `BuyerProfileIn(BaseModel)`: billing_payer_name: str = "", billing_inn: str = "", default_address: str = ""
- `BuyerProfileOut(BaseModel)`: id uuid.UUID, company_id uuid.UUID, billing_payer_name str, billing_inn str, default_address str, created_at datetime; model_config={"from_attributes": True}
- `OneClickDealIn(BaseModel)`: listing_id: uuid.UUID
- `OneClickDealOut(BaseModel)`: deal: DealOut, payment: "DealPayOut | None" = None, billing_payer_name: str, billing_inn: str, delivery_address: str
Place these near the Deal schemas.

### 3. backend/app/main.py — new endpoints (async style, working tree already async; prefix="" routes at root like existing)
Add BEFORE the YooKassa section (routes are at root, no /api prefix):

a) `@router.get("/buyer-profile", response_model=BuyerProfileOut)` with `user: User = Depends(require_roles(UserRole.buyer, UserRole.admin))`
   - load user's BuyerProfile by id == user.company_id. If none -> HTTPException 404 "Профиль покупателя не заполнен".
   - return it.

b) `@router.put("/buyer-profile", response_model=BuyerProfileOut)` with same auth.
   - if user.company_id is None -> 400 "У пользователя нет компании".
   - load buyer company (db.get(Company, user.company_id)); if None -> 400.
   - upsert BuyerProfile for that company_id (get existing by company_id, else create new with company_id).
   - set billing_payer_name, billing_inn, default_address from payload.
   - db.add/commit/refresh, return.

c) `@router.post("/deals/one-click", response_model=OneClickDealOut, status_code=201)` with `user: User = Depends(require_roles(UserRole.buyer, UserRole.admin))`
   Logic (mirror create_deal + deal_pay but single request using defaults):
   - if user.company_id is None -> 400 "У пользователя нет компании".
   - company = await db.get(Company, user.company_id); if None -> 400.
   - VERIFICATION GATE: if not company.verified -> raise HTTPException(403, "Аккаунт не верифицирован — покупка в 1 клик недоступна").
   - listing = await db.get(Listing, payload.listing_id); if None -> 404 "Listing not found"; if listing.status == ListingStatus.sold -> 400 "Товар уже продан".
   - profile = await db get BuyerProfile where company_id == user.company_id; if None or missing (not billing_payer_name or not billing_inn or not default_address) -> 400 "Заполните реквизиты плательщика (наименование, ИНН) и адрес доставки для покупки в 1 клик".
   - seller_company_id = listing.seller_id
   - amount = listing.price_rub
   - create Deal(listing_id, buyer_company_id=company.id, seller_company_id, status=created, amount_rub=amount, yookassa_payment_id=None, escrow_status="created", shipping_address=profile.default_address, transitions=[])
   - db.add(deal); await db.flush() so deal.id exists.
   - create payment: payment_id = new_payment_id(); payment = yookassa.create_safe_deal_payment(amount_rub=amount, deal_id=str(deal.id), payment_id=payment_id, return_url="https://partsdonor.local/pay/success")
   - deal.yookassa_payment_id = payment.get("id") or payment_id
   - listing.status = ListingStatus.negotiated
   - await db.commit(); await db.refresh(deal)
   - build DealPayOut(payment_id=deal.yookassa_payment_id or payment_id, deal_id=deal.id, status=payment.get("status","pending"), confirmation_url=(payment.get("confirmation") or {}).get("confirmation_url") if isinstance(payment.get("confirmation"), dict) else None, test=bool(payment.get("test", yookassa.test_mode)))
   - return OneClickDealOut(deal=deal, payment=pay_out, billing_payer_name=profile.billing_payer_name, billing_inn=profile.billing_inn, delivery_address=profile.default_address)

IMPORTS to ensure exist in main.py: new_payment_id, yookassa, ListingStatus, DealStatus, Deal, Company, BuyerProfile, require_roles, UserRole (all probably already imported; add BuyerProfile import).

Do NOT revert or rearrange anything else. Keep existing create_deal / deal_pay untouched (one-click is additive).

## Frontend changes

### 4. frontend/src/pages/PartDetail.jsx — «Купить в 1 клик» button
- import readSession and authFetch from '../auth.jsx'.
- Add state: `const [buyerProfile, setBuyerProfile] = useState(null)` and `const [buying, setBuying] = useState(false)`, `const [oneClickMsg, setOneClickMsg] = useState(null)`.
- On mount, if logged in, fetch `/api/buyer-profile` (authFetch) -> if ok setBuyerProfile(json). Also fetch `/api/companies` to check own company verified (find by session.company_id in returned list). Compute `session` = readSession().
- In the price block (under the «Купить со сделкой» Link, line ~84), add:
  - If session?.company_id && buyerProfile (fetched ok) => render `<button className="pd-btn pd-btn-success pd-btn-cart">⚡ Купить в 1 клик</button>` that calls:
    ```
    const r = await authFetch('/api/deals/one-click', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({listing_id: best.id})})
    ```
    on ok -> setOneClickMsg({type:'ok', text:`Сделка создана и оплата инициирована (эскроу). Плательщик: ${data.billing_payer_name}, ИНН ${data.billing_inn}, доставка: ${data.delivery_address}.`}) and optionally a Link to `/deal`.
    on !ok -> setOneClickMsg({type:'err', text: data?.detail || 'Не удалось оформить' + (r.status===401||r.status===403?' — нужен вход / верификация':'')})
  - If logged in WITHOUT profile/verified -> show muted hint: «Купить в 1 клик: заполните реквизиты плательщика и адрес в кабинете покупателя» with a link to /buyer.
  - If not logged in -> no button (user can still use regular flow).
- Render oneClickMsg near the price block.
- Add needed CSS classes in frontend/src/styles.css: `.pd-btn-success` (green), `.pd-oneclick-hint` (muted small). Reuse existing button styles.

### 5. frontend/src/pages/BuyerCabinet.jsx — «Покупка в 1 клик (реквизиты)» settings block
- Add state for billing_payer_name, billing_inn, default_address, profile loaded flag, saveMsg, saving.
- On load, in addition to existing fetches, fetch `/api/buyer-profile` (authFetch); if ok fill the three fields.
- Add a new <section aria-label="Покупка в 1 клик"> with a form:
  - Show verified badge for own company: from `buyer` object (it has `verified`). If buyer?.verified show `✓ Компания верифицирована`; else show `Не верифицирована — покупка в 1 клик недоступна до верификации`.
  - Fields: Наименование плательщика (text), ИНН (text), Адрес доставки по умолчанию (text).
  - Submit via authFetch PUT '/api/buyer-profile' {billing_payer_name, billing_inn, default_address}; on ok saveMsg ok «Реквизиты сохранены — теперь доступна покупка в 1 клик», else err with detail.
- Add minimal CSS (.pd-form already exists).

## Verification (MUST do and show real output)
1. Backend restart to create buyer_profiles table + load new routes:
   `cd /home/aifactory/PartsDonor/backend && pkill -f 'uvicorn app.main:app' ; nohup .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001 > /tmp/pd_ux1_backend.log 2>&1 &`
   Then `curl -s http://127.0.0.1:8001/openapi.json | grep -o 'buyer-profile\|one-click' | sort -u` to confirm routes present.
2. py_compile the changed backend files:
   `backend/.venv/bin/python -m py_compile backend/app/models.py backend/app/schemas.py backend/app/main.py`
   (DO NOT use pytest.)
3. Frontend build: `cd frontend && npm run build` — must exit 0 (fix until it does).
4. LIVE demo (write probe scripts under backend/ and run them with `backend/.venv/bin/python backend/_ux1_*.py`):
   - Script `_ux1_seed_buyer.py`: to make the demo work, set `companies.verified = true` for a chosen buyer company directly in DB (use asyncpg or SQLAlchemy against the same DB; easiest: reuse engine from app.db). Pick/register a fresh buyer (e.g. email ux1demo.verify@gmail.com — NON-reserved domain per project rule), get its company_id, mark verified=true, and print company_id + verified.
   - Script `_ux1_verify.py` (auth-based, mirrors _i2_verify_auth.py pattern): 
     Login as the demo buyer -> token.
     a) PUT /buyer-profile {billing_payer_name:"ООО Ромашка", billing_inn:"7701234567", default_address:"Москва, Ленина 10"} -> expect 200 and echo returned fields.
     b) GET /buyer-profile -> expect 200, fields present.
     c) Create/find an ACTIVE listing by the demo seller for this buyer to buy; or reuse existing active listing id (pick one with status active and seller_id != buyer). POST /deals/one-click {listing_id} -> expect 201; verify response deal.shipping_address == "Москва, Ленина 10", billing_payer_name/inn present, payment.test == true, deal.buyer_company_id == buyer company, deal.seller_company_id == listing seller, deal.status == "created", deal.escrow_status == "created".
     d) NEGATIVE: register a second fresh buyer NOT verified and not profiled; attempt POST /deals/one-click on the same listing -> expect 403 (verified gate) and that listing is NOT double-booked (its status unchanged / not negotiated by unverified buyer).
     e) GET /deals -> confirm the new one-click deal exists.
   Write output to a log file `backend/_ux1_verify.log` and paste the real stdout.
5. Screenshots (optional but nice): PartDetail with the 1-click button and BuyerCabinet with the payer form — save PNG as /home/aifactory/PartsDonor/pd-ux1-*.png (desktop 1440x900 and mobile 390x844). Use vite dev server. (If screenshot infra is too heavy, a frontend DOM presence check `curl` on built dev page is acceptable, but prefer screenshots via the same headless method used in prior cards.)

## Commit
- cd /home/aifactory/PartsDonor
- Add ONLY: backend/app/models.py, backend/app/schemas.py, backend/app/main.py, frontend/src/pages/PartDetail.jsx, frontend/src/pages/BuyerCabinet.jsx, frontend/src/styles.css, and the new _ux1_spec.md.
- DO NOT add scratch verify/seed scripts, logs, screenshots, _openapi_dump.json, __pycache__, or the pre-existing uncommitted files (inventree_client.py) — but main.py IS expected to already carry pre-existing P0-1 async edits; committing main.py along with UX-1 is fine (leave inventree_client.py out of the add list unless UX-1 touched it, which it must NOT).
- git add the listed files explicitly; `git commit -m "PartsDonor UX-1: Купить в 1 клик для верифицированных B2B (дефолтный плательщик/адрес)"`.
- Report the commit hash.

## Report back (concise)
- List of files changed.
- py_compile + npm build exit statuses.
- Live verify results (from _ux1_verify.log): the 201 one-click (deal fields incl. shipping_address/defaults/payment), and the 403 negative case.
- Commit hash.
- Screenshot absolute paths if produced.
Do NOT paste entire files.
