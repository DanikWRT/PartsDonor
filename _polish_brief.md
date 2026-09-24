# PartsDonor POLISH — pi-dev task brief

Project root: /home/aifactory/PartsDonor
Backend: backend/app (FastAPI). Frontend: frontend/src (React + Vite, proxy /api -> 8001).

## Environment facts (VERIFIED, do not re-verify basic infra)
- InvenTree live at 127.0.0.1:8000. PartsDonor backend uvicorn app.main:app on 127.0.0.1:8001 (workers 4) — uvicorn NOT in --reload, so after editing backend/app/*.py you MUST restart it (kill pid from `ps aux | grep 'uvicorn app.main:app'`, relaunch `cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 4`), then curl /health == ok.
- vite dev on 0.0.0.0:5173 (HMR picks up frontend edits automatically).
- DB (Postgres) already has: donor_lots table with ONE seeded lot:
    id=ba777dfc-7db7-43cd-8f6a-f707226f5a7d, title="Донор iPhone 13 Pro (комплект)", price_rub=38000, status=active, device_schema_id=a54da2f9-2873-4003-92d7-62180297d76d.
  donor_requests table empty. listings.donor_lot_id column EXISTS. Alembic head=1292e1d6a854 (donor tables already migrated). Seed already done — do NOT re-seed, do NOT duplicate donor lot.
- Donor: DeviceSchema Apple/iPhone 13 Pro, inventree_donor_part_id=6. BOM gives components display/board/battery/camera/backcover.
- Verified seller company = СмартРемонт id=e6f223e6-7542-4e15-bdd5-86c87a3a6ce9 (verified=True).
- Existing donor pages ALREADY EXIST and work: Catalog has toggle «Каталог деталей | Доноры целиком» (Catalog.jsx, showDonors state, renders DonorCatalog with DonorCard list). Routes /donor-lots (DonorLots.jsx) and /donor-lot/:id (DonorLot.jsx). Shared component frontend/src/components/DonorExploded.jsx exports ExplodedScheme, SLOT_META, statusCls, statusText, normalizeSlot, isFlat, DetailPanel, etc. DonorView.jsx (/donor/:brand/:model) already renders interactive exploded view.
- Auth: backend/app/auth.py. get_current_user (Bearer, 401 if no/invalid token), require_roles(*roles) -> 403 wrong role, 401 no token. Frontend: authFetch in frontend/src/auth.jsx attaches 'pd-token' from localStorage. Login POST /api/auth/login.
- Endpoints: backend/app/main.py. GET /catalog/{part_id} -> CatalogDetail {id,name,category,is_assembly,in_stock,description,listings,min_price,...}. GET /donor/{donor_part_id} -> DonorSchema {brand,model,exploded_view_url,components:[{slot,title,part_id,price_rub,status,hotspot}]}. GET /device-schemas -> list of {brand,model,inventree_donor_part_id,hotspots,...}. Donor-lot routes at lines ~407-725.

## THE 4 TASKS (this is the POLISH card)

### TASK 1 — Интерактивная РАЗВЁРТКА на части донора-комплекта /part/:id
Currently PartDetail.jsx (/part/:id) shows ONLY price/seller/buy/cart and a flat prop list — NO exploded view with incoming BOM parts (display, АКБ, плата, камера, корпус). Acceptance: on the donor-complex part card there must be an INTERACTIVE exploded view listing the incoming spare parts (BOM).
- In PartDetail.jsx: after catalog detail loads, detect donor-complex. Use the part's identity: a donor schema whose inventree_donor_part_id == this part id. Fetch `/api/device-schemas`, find schema with inventree_donor_part_id == data.id; if found (or if data.is_assembly), fetch `/api/donor/{data.id}` to get components (BOM) and merge hotspots from schema.hotspots (match by normalizeSlot on slot). Render `<ExplodedScheme components=... onSelect={update a selected detail panel} />` in a new section (e.g. under the price block / above ОППЕРЕТСOR) so a click on a layer opens a small info panel (title/price/status) — reuse DetailPanel or an inline panel. Reuse the shared DonorExploded component — do NOT reimplement the scheme.
- IMPORTANT: if the part id is NOT a donor (no schema matches, not assembly), render nothing extra — catalog parts keep today's layout (no regression).
- Add a clear heading like «Развёртка аппарата / Комплектация донора» and an optional link «Смотреть как донор целиком →» to /donor-lot/<uuid> if a donor_lot exists for that schema (you may look it up via GET /api/donor-lots and match device_schema_id or donor_part_id).
- Must look good on mobile AND desktop (reuse existing .pd-* styles / add small CSS additions in styles.css under a new /* POLISH: part donor exploded */ section; no horizontal overflow <=480px).

### TASK 2 — Починить HTTP 401 на «донор целиком» (donor-lot page + deal/request)
REPRO & ROOT CAUSE (already diagnosed): GET /donor-lots/{id} (backend/app/main.py line ~467) is protected by `user: User = Depends(require_roles(UserRole.seller, UserRole.admin, UserRole.buyer))` — requires ANY auth. But frontend DonorLot.jsx fetches that detail with PLAIN `fetch('/api/donor-lots/${id}')` (no token). So a logged-out visitor opening /donor-lot/<id> gets HTTP 401 and the whole donor page (including exploded view) never renders. THIS IS THE BUG.
FIX (backend): make GET /donor-lots/{id} PUBLIC — remove the mandatory auth dependency. `requests` should still be returned only for the lot's seller (and admin): use an OPTIONAL current-user dependency (e.g. `user: User | None = Depends(optional_current_user)` where optional_current_user returns None when no/invalid token instead of 401) and gate `requests_out` on `user and user.role in (seller,admin) and user.company_id == lot.seller_id`.
- Add an `optional_current_user` dependency in backend/app/auth.py (returns None instead of raising when credentials absent or token invalid). Do not break existing required-auth behavior elsewhere.
- VERIFY: (a) logged-out GET /api/donor-lots/{id} -> 200 with components + exploded data (this is the main acceptance). (b) POST /api/donor-lots/{id}/request without token -> 401 with clear message «Not authenticated». (c) POST /api/donor-lots/{id}/deals without token -> 401. (d) With a verified buyer token: /request -> 201 (creates donor_request), /deals -> 201 (creates Deal + whole listing, lot.status -> negotiated) OR a clear 400/403 if buyer not verified/no profile. Note: /deals requires company.verified=True AND complete BuyerProfile (billing_payer_name/inn/default_address) else 400/403 with clear message — that's correct behavior, keep it.
- On the frontend, make sure the donor detail fetch still renders fine anonymously, and the deal/request buttons show a clear «Необходим вход» state when no token (DonorLot.jsx already has some of this — fix/verify).

### TASK 3 — ЗАГЛУШКИ / обратная связь для ВСЕХ мёртвых кнопок
Audit EVERY button/CTA in the frontend (Catalog.jsx, PartDetail.jsx, DonorLot.jsx, DonorLots.jsx, DonorView.jsx, Cabinet.jsx, BuyerCabinet.jsx, Deal.jsx, Auth.jsx, DonorExploded.jsx, App.jsx). For any button that currently has NO working handler / does nothing when clicked / triggers a not-yet-implemented flow:
- Either implement the handler if trivial, OR add a VISIBLE STUB: `disabled` attribute + a toast/notice «Функция в разработке» / «Скоро» so it's unmistakable the feature is not in MVP.
- Examples to check: the «Купить целиком» button when not a buyer / when lot sold; any review/rating buttons; any cart «Оформить» that goes nowhere; any status buttons; any «Перейти к оплате» placeholders. Decide each: working or disabled+notice. Do NOT leave a button that appears clickable but silently does nothing.
- Pay attention to DonorLot.jsx: when sessionRole is not 'buyer' (e.g. seller viewing own lot, or admin), the «Купить целиком» button is currently hidden entirely — that's fine, but ensure a clear state. Also the «Оставить заявку» form requires hasToken.

### TASK 4 — Раздел «Доноры» в навигации
- In frontend/src/App.jsx HeaderNav (the header <nav class="pd-nav">), ADD a NavLink «Доноры» to /donor-lots (e.g. before «Кабинет»): `<NavLink to="/donor-lots">Доноры</NavLink>`. Keep existing links. Ensure active styling works.
- The catalog already has the «Доноры целиком» toggle — verify it's prominent and reachable (it's the primary place), the nav link is the additional discoverability entry point.

## VERIFICATION (MANDATORY, live — do all)
1. Frontend: `cd /home/aifactory/PartsDonor/frontend && npm run build` -> exit 0.
2. Restart backend (see environment facts) -> curl http://127.0.0.1:8001/health ok AND `curl -s http://127.0.0.1:8001/api/donor-lots` returns the donor lot.
3. curl checks (record to log):
   - GET /api/donor-lots/{id} (id=ba777dfc-7db7-43cd-8f6a-f707226f5a7d) WITHOUT token -> 200 + components (TASK 2 fix verified).
   - GET /api/donor/6 -> 200 with BOM components list.
   - POST /api/donor-lots/{id}/request and /deals WITHOUT token -> 401.
   - Login a verified buyer (register or reuse via a python seed/script in backend/, similar to existing _s1_seller.py/_s1_users.py patterns; a fresh registered buyer is NOT verified — mark it verified + give it a BuyerProfile via a script OR reuse an existing verified buyer if you can find credentials in the repo's seed scripts/tests). Then with token: POST /request -> 201; POST /deals -> 201 and donor lot status -> negotiated (then restore/note). If you cannot produce a verified buyer, document it and still verify the 401-without-token + 400-with-unverified states.
4. Playwright live (chromium, http://127.0.0.1:5173/):
   a) LOGGED OUT: open /part/6 -> exploded view with BOM parts visible (TASK 1). Screenshot pd-polish-part6-desktop.png.
   b) LOGGED OUT: open /donor-lot/ba777dfc-7db7-43cd-8f6a-f707226f5a7d -> page renders 200 (TASK 2 fix), exploded scheme visible. Screenshot pd-polish-donor-anon-desktop.png.
   c) Header nav shows «Доноры» link -> click -> donor list (TASK 4). Screenshot pd-polish-nav-desktop.png.
   d) Mobile 400px on /part/6 and /donor-lot/*: no horizontal overflow, exploded view + buttons OK. Screenshots pd-polish-part6-mobile.png, pd-polish-donor-lot-mobile.png.
   e) Dead-button sweep: click every visible button on each page; confirm none silently does nothing (either works or shows disabled/toast). Note findings.
5. Write ALL steps/results (curls, statuses, DOM metrics, screenshots, deal_id if created) to /home/aifactory/PartsDonor/backend/_polish_verify.log (append, marked PASS/FAIL).

## REPORT (final Pi message)
List changed files (backend + frontend), npm build + alembic result, every live check PASS/FAIL, deal_id if created, screenshot paths, path to _polish_verify.log, brief description of each of the 4 fixes, and how you handled dead buttons. Do NOT git commit. Do NOT touch files unrelated to the four tasks. Keep changes minimal and consistent with existing conventions (reuse DonorExploded, pd-* CSS tokens, authFetch, require_roles).
