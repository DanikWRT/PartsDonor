# PartsDonor F4 — Кабинет покупателя (корзина / заказ / отслеживание) — CORRECTED spec

Frontend Vite/React at /home/aifactory/PartsDonor/frontend. Backend LIVE on 127.0.0.1:8001.
Vite dev NOT currently running; proxy: /api/* -> backend with /api stripped (so fetch('/api/deals') hits backend /deals).

## LIVE BACKEND TRUTH (verify against this; do NOT trust old brief's machine)
- POST /deals  body {listing_id, buyer_company_id, seller_company_id?=null, amount_rub, shipping_address} -> 201 DealOut (status 'created', escrow_status 'created'). Listing -> negotiated.
- GET /deals -> list DealOut.
- POST /deals/{id}/transition  body {"to": <status>} (optional "from_status") -> {from_status, to_status, ok, deal}. THIS is the ONLY status-change endpoint. There is NO PATCH /deals/{id}/status.
- GET /companies -> list with role field ('buyer'/'seller'). Buyer company has role==='buyer'.
- GET /catalog/{part_id} -> {id,name,category,in_stock,listings:[{id,title,price_rub,condition,provenance,warranty,status,seller_name,...}],min_price,...}
- GET /catalog -> CatalogItem[] each {id,name,category,in_stock,listing_price,listing_id,listing_condition,seller_name,...}

## LIVE STATUS MACHINE (8 states), buyer-relevant transitions:
  created -> escrow_paid -> seller_confirmed -> shipped -> delivered -> buyer_confirmed -> payout -> completed
  + refunded, dispute (side branches).
  BUYER actions (buyer drives these):
    created   -> "Оплатить (эскроу)"   => transition {to:'escrow_paid'}
    delivered -> "Подтвердить получение" => transition {to:'buyer_confirmed'}
  (seller drives seller_confirmed/shipped etc — not in buyer cabinet)
  escrow_status maps: created='created', escrow_paid='paid', seller_confirmed/shipped/delivered/buyer_confirmed='in_progress', payout/completed='released', refunded='refunded'.

## What already exists (do not break; reconcile)
- frontend/src/pages/BuyerCabinet.jsx — a buyer-cabinet page ALREADY written but against the WRONG machine (uses PATCH /status, statuses paid_escrow/shipped/buyer... must be reworked to the LIVE 8-state machine + POST /transition).
- frontend/src/App.jsx — already has <Route path="/buyer" element={<BuyerCabinet/>} /> and header NavLink "Покупателю".
- frontend/src/pages/Catalog.jsx, PartDetail.jsx — no cart wiring yet.

## Tasks
1) Create frontend/src/cart.jsx with React CartContext + useCart. API: items[{listing_id,title,price_rub,condition,seller_name}], count, total, add(item), remove(id), clear(), has(id). Dedup by listing_id. Persist to localStorage key 'pd-cart' (init from it, write on change).
2) App.jsx: wrap the whole <div className="pd-app"> with <CartProvider>. Header: convert to show a cart NavLink with count badge, e.g. "Корзина (N)" from useCart. CartProvider/cart consumer must be INSIDE provider.
3) Catalog.jsx: in each .pd-card (it's a <Link>), add "В корзину" button inside .pd-card-body with onClick that preventDefault+stopPropagation (so card Link doesn't navigate), add({listing_id:i.listing_id, title:i.name, price_rub:i.listing_price, condition:i.listing_condition, seller_name:i.seller_name}). Only show button when i.listing_id && i.listing_price != null.
4) PartDetail.jsx: add "В корзину" for the best/offer listing (id, title, price_rub, condition, seller_name) in the .pd-offer / price block; show "✓ В корзине" disabled when has(id).
5) REWORK frontend/src/pages/BuyerCabinet.jsx to use the shared cart context (useCart) — inherit from the existing file (it already has deal stepper, badges, checkout, adaptive). Fix:
   - Instead of its own localStorage cart, use useCart items/add(from catalog only)/remove/clear.
   - Checkout: POST /deals per item {listing_id, buyer_company_id: buyer.id, amount_rub: price_rub, shipping_address}. On success remove that item from cart. On error leave it.
   - Orders: GET /deals, filter buyer_company_id===buyer.id, sort created_at desc.
   - Stepper maps LIVE machine to stages: [created, escrow_paid, seller_confirmed, shipped, delivered, buyer_confirmed, payout, completed]. Highlight current; refunded/dispute shown as badge only.
   - Status + escrow badges with LIVE labels (RU): created=Создана, escrow_paid=Оплата в эскроу, seller_confirmed=Продавец подтвердил, shipped=Отгружена, delivered=Доставлена, buyer_confirmed=Получение подтверждено, payout=Выплата продавцу, completed=Завершена, refunded=Возврат, dispute=Спор.
   - Buyer action buttons (created->Оплатить=>{to:'escrow_paid'}; delivered->Подтвердить получение=>{to:'buyer_confirmed'}). Call POST /deals/{id}/transition, update deal from response.deal.
   - Listing title resolved by mapping GET /listings by id.
6) Add any needed .pd-* CSS classes to frontend/src/styles.css at the END (don't remove existing). Adaptive: 390px single column no h-overflow, 1440px 2-col for deals + cart grid. Use existing media queries 768/1100.

## Non-negotiables
- Do NOT touch backend/. Do NOT touch Cabinet.jsx (seller cabinet).
- npm run build in frontend must exit 0.
- Target the LIVE backend machine as described — verify against running server where possible.

## Verify then report
- npm run build exit 0.
- If vite dev not running, start `npm run dev` (background) so screenshots can be taken; then capture /buyer at 390x844 and 1440x900 via browser (playwright or the repo's browser harness used for F3).
- Report file paths changed + screenshot paths.
