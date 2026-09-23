# PartsDonor UX-2: статус «Продано» + подписка «Сообщить, когда появится»

Repo: /home/aifactory/PartsDonor (branch master, git repo)
Backend venv: /home/aifactory/PartsDonor/backend/.venv
Backend: uvicorn app.main:app on 127.0.0.1:8001 (currently running from an earlier card — you MUST restart it after schema changes so create_all adds the new table)
DB: postgresql+asyncpg://pduser:pdpass@localhost:5433/partsdonor (backend creates tables via Base.metadata.create_all on startup; NEW tables are created on restart, existing tables are NOT altered)
Frontend: vite dev at http://localhost, proxy /api -> 127.0.0.1:8001 strips /api. Files under frontend/src. npm build to verify.
Auth: JWT via authFetch; roles seller/buyer/admin; a user's company is `user.company_id`, not derivable from login body.

## Context
Parent UX-1 (commit 3f2c09a) added GET/PUT /buyer-profile + POST /deals/one-click. A one-click buy marks the listing `negotiated` and eventually `sold`. Today `catalog_detail` (backend/app/main.py, ~l.265-327) returns ONLY listings with status == `active`, so a sold listing is invisible on the detail card — we lose 30-40% of repeat traffic. UX-2 requirement: on the part detail card show the «Продано» status for sold listings + a «Сообщить, когда появится» subscribe button, and the BACKEND must notify a subscriber when a NEW listing for that part appears.

ACCEPTANCE: у проданного листинга виден статус Sold, возможность подписаться; при новом листинге подписчик уведомляется (механизм бэкенда).

## Design decisions (FIXED — implement exactly these)
- Subscription is PER-COMPANY of the logged-in user (B2B). Company = companies.id via user.company_id. A user without a company gets 400.
- One subscription per (company_id, inventree_part_id) — unique.
- Notification mechanism = stored + retrievable: when a NEW active listing is created for a subscribed part, mark the matching subscription(s) notified=true + notified_at. The subscriber reads them back via GET /notifications (the mechanism is real and testable headless; no email/SMS infra in MVP).
- catalog_detail returns ALL listings for the part (active, negotiated, sold), each carrying its status — the frontend renders active ones as offers and sold/negotiated ones as a distinct «Продано/Забронировано» block with the subscribe button. min_price computed from ACTIVE listings only (unchanged).

## Backend changes

### 1. backend/app/models.py — new table ListingSubscription (additive; do NOT alter existing tables)
```
class ListingSubscription(Base):
    __tablename__ = "listing_subscriptions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id"), index=True)
    inventree_part_id: Mapped[int] = mapped_column(Integer)
    notified: Mapped[bool] = mapped_column(default=False)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("company_id", "inventree_part_id", name="uq_subscription_company_part"),)
```
Ensure `UniqueConstraint` is imported from sqlalchemy. Keep style consistent with BuyerProfile.

### 2. backend/app/schemas.py — new schemas
- `SubscriptionStatusOut(BaseModel)`: subscribed: bool; part_id: int
- `SubscriptionIn(BaseModel)`: inventree_part_id: int
- `SubscriptionOut(BaseModel)`: id uuid.UUID, company_id uuid.UUID, inventree_part_id int, notified bool, notified_at datetime | None, created_at datetime; model_config={"from_attributes": True}
- `NotificationOut(BaseModel)`: id uuid.UUID, inventree_part_id int, part_name str | None = None, notified_at datetime; (one per notified subscription)

### 3. backend/app/main.py — new endpoints + create_listing hook (async style, root prefix like existing)
Add a new section «SUBSCRIPTIONS & NOTIFICATIONS» (place before or after the DEALS section — anywhere consistent). All use `user: User = Depends(require_roles(UserRole.buyer, UserRole.admin))` (a buyer subscribes).

a) `@router.get("/subscriptions", response_model=SubscriptionStatusOut)`
   query param `part_id: int`. If user.company_id None -> 400 "У пользователя нет компании". Return {subscribed: <exists for (company_id, part_id)>, part_id}.

b) `@router.post("/subscriptions", response_model=SubscriptionOut, status_code=201)`
   body SubscriptionIn{inventree_part_id}. If user.company_id None -> 400. Upsert: if a subscription (company_id, inventree_part_id) exists -> return it (200? just return existing with status 201 is fine; simpler: return existing record). Else create with notified=False. db.commit/refresh, return.

c) `@router.delete("/subscriptions", response_model=dict)`
   query param `part_id: int`. Delete subscription for (company_id, part_id). Return {"ok": True}.

   (Query-param style matches GET; keeps it simpler than path params. Use FastAPI `part_id: int` query param.)

d) `@router.get("/notifications", response_model=list[NotificationOut])`
   Return all listing_subscriptions for user.company_id where notified==True. For each, resolve part_name via the existing `_part_info(part_id)` helper (it returns (name, category)); put it in part_name. Order by notified_at desc. Do NOT auto-clear; clearing/ack is out of scope (mechanism just surfaces them).

e) MODIFY `create_listing` (currently ~l.449, auth: seller/admin): after the listing is flushed/committed with a real `inventree_part_id`, and BEFORE/after returning — when the new listing's status is default active (it is by default) and inventree_part_id is not None, run:
   `subs = (await db.execute(select(ListingSubscription).where(ListingSubscription.inventree_part_id == record.inventree_part_id, ListingSubscription.notified == False))).scalars().all()`
   for each: `s.notified = True; s.notified_at = now()`; `await db.commit()`. This is THE notification mechanism (new listing -> notify subscriber). Wrap in try/except so a subscription failure never breaks listing creation.

IMPORTS to ensure: ListingSubscription, UniqueConstraint in models; in main.py import ListingSubscription, SubscriptionStatusOut, SubscriptionIn, SubscriptionOut, NotificationOut. All other imports already present (select, Company, Listing, require_roles, UserRole, _part_info).

### 4. backend/app/main.py — catalog_detail returns ALL listings (show Sold)
In `catalog_detail` (~l.291) remove the `active = [...]` filter for the LISTING LIST: iterate ALL listings, build a CatalogListingOut for EACH (price/condition/provenance/warranty/status/seller fields from the listing object just like now, using l.status.value). Only for `min_price`/`min_condition` computation consider listings with status == ListingStatus.active (unchanged). Keep order_by price_rub.asc. The CatalogListingOut already has a `status: str` field, so sold listings now flow to the frontend tagged with status="sold".

## Frontend changes (frontend/src/pages/PartDetail.jsx + styles.css)

### 5. PartDetail.jsx — Sold status + subscribe button + per-listing status
- imports: already has authFetch, readSession. Add nothing new beyond existing helpers.
- Add state: `const [subStatus, setSubStatus] = useState(null)` and `const [subMsg, setSubMsg] = useState(null)` (null | {type, text}).
- On mount (the existing useEffect that loads buyer-profile when logged in), also if logged in AND data present, fetch `/api/subscriptions?part_id=${id}` (authFetch) -> on ok setSubStatus(resp.subscribed).
- Derive: `const activeListings = (data.listings||[]).filter(l => l.status === 'active')` and `const soldAny = (data.listings||[]).some(l => l.status === 'sold')`. Change `best` to `const best = activeListings[0]` (was data.listings[0]) so buy/cart/one-click only use active offers.
- SOLD STATE: when there are NO active listings but there ARE sold listings (or listings all sold), show a «Продано» badge and the subscribe button in the price block instead of the buy buttons:
  - Replace the `.pd-price-big` block content when no active offers: keep price display if min_price else «Продано», add `<span className="pd-badge sold">Продано</span>`.
  - Show subscribe area (when logged in OR offer guest subscribe — simplest: show the button to everyone):
    - Not subscribed: `<button className="pd-btn pd-btn-primary pd-btn-cart" onClick={subscribe}>🔔 Сообщить, когда появится</button>`
    - Subscribed: `<button className="pd-btn pd-btn-cart" onClick={unsubscribe}>✓ Вы подписаны — уведомим о новом листинге</button>`
    - `subscribe()` = authFetch POST `/api/subscriptions` {inventree_part_id: data.id}; on ok setSubStatus(true) + msg ok «Мы уведомим вас, когда появится новый листинг»; on 401/400 treat as «нужен вход» hint.
    - `unsubscribe()` = authFetch DELETE `/api/subscriptions?part_id=${data.id}`; on ok setSubStatus(false).
    - subMsg rendered as .pd-form-ok / .pd-form-err like oneClickMsg.
- OFFERS LIST (the «Предложения» block): each li — if l.status === 'sold' show `<span className="pd-badge sold">Продано</span>` next to title (and keep the «Сделка» link hidden for sold listings — or disabled; show nothing actionable). For active ones keep existing behavior. If there are active listings, the subscribe button is NOT needed (user can just buy) — only show subscribe UI in the no-active-offer case above.
- Add CSS in frontend/src/styles.css: `.pd-badge.sold` (dark/red pill «Продано»), reuse `.pd-btn-primary`, `.pd-btn-cart` existing styles. Keep it minimal and consistent with existing .pd-badge.in/.out.

Keep oneClick buy / «Купить со сделкой» / cart going through `best` (now first ACTIVE listing) — unchanged otherwise. DO NOT break the UX-1 one-click flow.

## Verification (MUST do and show real output)
1. py_compile changed backend files:
   `backend/.venv/bin/python -m py_compile backend/app/models.py backend/app/schemas.py backend/app/main.py` (DO NOT use pytest; run as python3 file.py if standalone).
2. Restart backend (creates listing_subscriptions table + loads routes):
   `cd /home/aifactory/PartsDonor/backend && pkill -f 'uvicorn app.main:app' ; sleep 1; nohup .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001 > /tmp/pd_ux2_backend.log 2>&1 &`
   Then wait ~4s and `curl -s http://127.0.0.1:8001/openapi.json | grep -o 'subscriptions\|notifications' | sort -u` to confirm routes live.
3. Frontend build: `cd /home/aifactory/PartsDonor/frontend && npm run build` — must exit 0 (fix until it does).
4. LIVE verify (write probe script under backend/ and run with `backend/.venv/bin/python backend/_ux2_verify.py`; write real stdout to backend/_ux2_verify.log):
   - Register/login a buyer (NON-reserved email domain per project rule, e.g. ux2sub.verify@gmail.com), get token. Ensure its company_id is set.
   - Seed/find a listing and force it sold in DB, OR create a listing then PATCH its status to sold (via seller token or direct DB write using app.db engine — reuse the pattern in _ux1_seed_buyer.py). Use an inventree_part_id that exists (pick one from an existing active listing or seed data). Steps:
     a) POST /subscriptions {inventree_part_id: P} as the buyer -> 201, echoed id/part_id/notified=false.
     b) GET /subscriptions?part_id=P -> subscribed=true.
     c) GET /notifications -> should be empty (not yet notified) for this buyer.
     d) As a SELLER (login seller with company; or reuse admin — admin has no company, so use a seller), POST /listings for the SAME inventree_part_id P -> 201 (new active listing).
     e) GET /notifications again -> now contains 1 item: inventree_part_id=P, notified_at set, part_name present. THIS proves the «при новом листинге подписчик уведомляется» mechanism.
     f) GET /catalog/P -> response contains BOTH the sold listing (status="sold") AND the new active listing (status="active") — proves catalog_detail now exposes Sold. Print the statuses.
     g) DELETE /subscriptions?part_id=P -> ok:true.
   - Write output to backend/_ux2_verify.log and paste the real stdout.
5. Screenshots (optional but nice): PartDetail showing Sold badge + «Сообщить, когда появится» — save PNG as /home/aifactory/PartsDonor/pd-ux2-*.png if you can reuse the headless screenshot method from prior cards; otherwise skip (DOM-presence via the verify log is acceptable).

## Commit
- cd /home/aifactory/PartsDonor
- Add ONLY: backend/app/models.py, backend/app/schemas.py, backend/app/main.py, frontend/src/pages/PartDetail.jsx, frontend/src/styles.css, _ux2_spec.md.
- DO NOT add scratch verify/seed scripts, logs, screenshots, __pycache__; do NOT add inventree_client.py (pre-existing uncommitted P0-1 edits — leave it out unless UX-2 touched it, which it must NOT).
- git add the listed files explicitly; `git commit -m "PartsDonor UX-2: статус Продано + подписка «Сообщить, когда появится»"`.
- Report the commit hash.

## Report back (concise)
- List of files changed.
- py_compile + npm build exit statuses.
- Live verify summary from _ux2_verify.log: subscription 201, notified-flip after new listing (the e-step result), catalog_detail exposing sold+active statuses, DELETE ok.
- Commit hash.
- Screenshot absolute paths if produced.
Do NOT paste entire files.