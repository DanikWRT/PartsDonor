# F7 — Interactive seller donor teardown (PartsDonor frontend)

## Goal
Rewrite `frontend/src/pages/DonorView.jsx` into an INTERACTIVE SELLER donor-teardown module. The route `/donor/:brand/:model` is already linked from the seller Cabinet, so we enhance the same file (keep the existing rich pseudo-3D exploded layers). Do NOT touch the buyer Catalog/PartDetail main screens.

## Acceptance
1. Teardown renders on mobile AND desktop, no horizontal overflow (scrollWidth==clientWidth at 390px and 1440px).
2. CLICK ON A LAYER/HOTSPOT -> OPENS A DETAIL PANEL for that part (деталь), not just toggling status.
3. Touch-friendly: tap targets >= ~44px; detail panel = bottom sheet on mobile (<=480px), right side panel on desktop; close via backdrop tap and X button.
4. Seller can manage each part's status from the detail panel (В наличии / Забронировано / Продано) via PATCH /listings/{listing_id} with JWT from localStorage 'pd-token'.
5. Screenshots desktop + mobile.

## Data & endpoints (VERIFIED live, backend http://127.0.0.1:8001, vite proxies /api -> 8001)
GET /api/donor/{donor_part_id} (donor part id is 6 for Apple/iPhone 13 Pro) -> { brand, model, exploded_view_url, components:[{slot,title,part_id,price_rub,status,hotspot:{}}] }
  NOTE: slot = LONG part name e.g. "Дисплей iPhone 13 Pro (ориг.)", NOT a short key. status: active|negotiated|sold|none.
GET /api/device-schemas: hotspots keyed by SHORT slot {display,board,battery,camera,backcover} with {x,y} 0..1, plus inventree_donor_part_id.
GET /api/listings: each has id, inventree_part_id, seller_id, part_name, part_category, title, price_rub, condition, provenance, status.
PATCH /api/listings/{listing_id} body {status} (also price_rub, condition). Requires JWT: Authorization: Bearer <localStorage['pd-token']>.

## Implementation requirements
1. SLOT NORMALIZATION: map each component's long slot/title to a canonical short key so exploded layers render correct geometry. Map by Russian substring:
   - contains "Дисплей" -> display; "Материнск"|"Плата" -> board; "Аккумулятор" -> battery; "Камера" -> camera; "Корпус" -> backcover; fallback: keep raw slot (generic rect).
   Normalized key feeds SLOT_META and SlotLayer (existing switch). Keep hotspot coords from device schema by short key; else default centering.
2. JOIN listings client-side: fetch BOTH /api/donor/{donor_part_id} and /api/listings; build per-component listing info (listing_id, part_category, condition, provenance) matching inventree_part_id.
3. INTERACTION: clicking a layer button opens the DETAIL PANEL for that part (set selected component state). Do NOT toggle sold on scheme click. ExplodedScheme gets onSelect(c) callback replacing onMark toggle. Keep status dots/legend but selection drives detail panel, not sold toggling.
4. DETAIL PANEL (деталь): shows part label, category, price (ru-RU P), condition, provenance, status badge, and seller status buttons. Buttons call PATCH /api/listings/{id} {status} with Bearer token; optimistic update; show success/error; if no token show 'Необходим вход (JWT отсутствует)' hint instead.
   - Desktop: right side panel (grid scheme|detail). Mobile <=480px: bottom sheet fixed panel; close on X and backdrop tap.
5. KEEP existing exploded layer artwork (DisplayLayer/BoardLayer/BatteryLayer/CameraLayer/BackcoverLayer/SlotLayer/ShadowDef/ExplosionAxis) essentially intact.
6. Add CSS in frontend/src/styles.css under a clear 'F7' section (pd-f7-*): panel styles, bottom-sheet, active-layer highlight (selected layer accent ring), status buttons, adaptive media query <=480px.
7. `npm run build` exits 0.

## Verification (live: backend 127.0.0.1:8001 + vite 127.0.0.1:5173 running)
- Open http://127.0.0.1:5173/donor/Apple/iPhone%2013%20Pro in Playwright.
- Click a layer -> detail panel appears with correct part info.
- Change status via button, confirm PATCH applied (re-fetch /api/listings shows new status).
- Adaptive: no horizontal overflow at 390px and 1440px (scrollWidth==clientWidth), panel layout differs.
- Save screenshots pd-f7-teardown-desktop.png (1440px) and pd-f7-teardown-mobile.png (390px) in /home/aifactory/PartsDonor.

## Constraints
- Frontend only. Do NOT modify backend/* or other frontend pages. Only touch: frontend/src/pages/DonorView.jsx and frontend/src/styles.css.
- Report final output: files changed, build result, verification steps run, screenshot paths.
