# SCR-6 — Чат (диалоги + сообщения + оффер) — reference 05

Rebuild the PartsDonor chat screens to match `References/ref-parthub/05-chat.html` (dark blueprint design system). Backend BE-3 (chat) is DONE and live on shared DB. This card is FRONTEND rebuild + e2e proof.

## Current state (what exists today, BE-3 minimal — REBUILD/migrate these)
- `frontend/src/pages/Chats.jsx` (100 lines) — dialog list, LIGHT theme, no unread filter, no search, single column.
- `frontend/src/pages/ChatView.jsx` (232 lines) — message window, LIGHT theme, single column, no pinned item card, no right panel, no quick replies, no day dividers.
- `frontend/src/App.jsx` routes: `/chats` -> Chats, `/chat/:id` -> ChatView. Nav links exist.
- `frontend/src/styles.css` has an old LIGHT `pd-chat-*` block (lines ~1401-1494). REPLACE with a dark themed block (prefer new `ch-*` prefixed classes scoped under a `.pd-app-chat` wrapper, mirroring how `wz-*` / `br-*` / `sf-*` scoped dark themes work).

## Design system (DARK blueprint — match this, NOT the old light chat)
CSS variables already defined in styles.css near the showcase theme (~line 1745, under `.pd-app-showcase`):
```
--bg-0:#050608; --accent:#4fa3ff; --accent-2:#7cf7d0; --text:#f0f3f8; --text-2:#a4adc2;
--muted:#6a7388; --green:#22c55e; --yellow:#fbbf24; --red:#ef4444; --blue:#60a5fa;
--purple:#a78bfa; --glass:rgba(255,255,255,.04); --stroke:rgba(255,255,255,.08); --stroke-2:rgba(255,255,255,.16);
```
These tokens are defined under `.pd-app-showcase` scope. To use them on the chat screens, add a `.pd-app-chat` class to the app wrapper AND copy/scaffold the same CSS variable definitions under `.pd-app-chat` scope (do NOT depend on the showcase scope). Add `.bg-blueprint` background fixed layer rendered on the chat page (it's a fixed radial+grid layer; reuse the existing `.bg-blueprint` CSS or replicate ~10 lines).

Font: Inter/system-ui. 

## Reference 05 layout (3 columns, fixed height, scroll inside panels)
```
<aside class="chat-list"> 320px  |  <section class="chat-view"> 1fr  |  <aside class="right-panel"> 300px
```
- Desktop (>1200px): 3 columns `320px 1fr 300px`, right panel VISIBLE.
- 801-1200px: `300px 1fr`, right panel `display:none`.
- <=800px: single column; show EITHER list or view (toggle with state + back button). Right panel hidden. Back button visible.

## CHAT LIST (left column) — rebuild Chats.jsx
Header:
- Title «Диалоги».
- Filter chips (segmented control): «Все» and «Непрочитанные» + live count badge (sum of unread across dialogs). Active chip highlighted.
- Search box 🔍 «Поиск по диалогам...» — filters by other_participant_name OR last_message.body (case-insensitive).
- List of dialogs. Each row: avatar (44px rounded, gradient color derived from participant name hash, shows first letter/initial), name, role badge (buyer=«Покупатель» blue, seller=«Продавец» green), preview (last message text; for offer show «💰 Оффер <body>», for attachment «📎 Вложение»), time (formatted), unread badge (gradient pill showing unread_count). Active dialog row has left accent inset + accent tint bg.
- Clicking a row: mark read (`POST /dialogs/{id}/read`) then navigate('/chat/'+id).

Data: `GET /dialogs` -> array of `DialogOut`:
`{ id, listing_id, donor_lot_id, created_at, updated_at, unread_count, last_message: {...}|null, other_participant_id, other_participant_name }`
Order already newest-first by the backend. unread filter = `unread_count > 0`.

## CHAT VIEW (center) — rebuild ChatView.jsx into 3-column layout
Header: back button (mobile only), avatar (40px), name (other_participant_name), status line, header actions (decorative icons, non-functional).
PINNED ITEM (привязанный товар) — render if dialog.listing_id OR donor_lot_id present:
- `GET /dialogs/{id}` -> `DialogDetailOut` has listing_id, donor_lot_id. Use them.
- Fetch the attached listing/donor_lot for icon+title+sub+price if a fitting endpoint exists (`GET /listings/{id}` / `GET /donor-lots/{id}`), best-effort; if fetch fails show generic pinned card with title = part/listing title or dialog id. Must NOT crash.
- Card: icon box, title, sub, price (gradient text). Below header, above messages.
Messages thread:
- Day dividers («Сегодня», «Вчера», or date) between runs of different dates.
- Each message: avatar (optional 32px) + bubble. `mine` when `m.author_id === session.user_id`. `me` bubbles gradient accent tint aligned right; theirs glass aligned left.
- Bubble text for kind=text; read check (✓ colored) on own messages.
- Offer card (kind=offer): label «Коммерческое предложение», big price `MONEY(m.offer_price)`, sub body, and IF !mine AND offer_status==='pending': buttons «Принять» (gradient) / «Отклонить» (ghost) -> `POST /offers/{offer_id}/accept` | `/reject`. If resolved show status badge (принят/отклонён).
- Attachment card (kind=attachment): icon + link to `m.attachment_url`.
Composer (bottom):
- Row: attach button 📎, textarea «Написать сообщение...», send button ▶ (gradient, disabled while sending).
- Offer mode: 💰 «Предложить цену» action toggles a price input; sends `{kind:'offer', offer_price:N}`.
- Quick replies row (chips): «Здравствуйте! Деталь ещё в наличии?», «Какая цена?», «Можете отправить фото?», «Готов купить сегодня.», «Спасибо!» — clicking fills the textarea.
- Polling: reload messages every ~5s + mark read on open.
- Auto-scroll to bottom on new messages.

## RIGHT PANEL (300px, desktop >1200px) — Собеседник
- Info card «👤 Собеседник»: big avatar (64px), name, role, rating placeholder, stats rows (Сделок/Отзывов/Город/На сайте с) — backend does NOT provide these for a dialog participant; render «—» gracefully.
- Info card «⚡ Действия»: «💰 Предложить цену» (activates offer mode), «✅ Оформить сделку» (non-functional no-op), «📎 Отправить файл» (attachment), «🚫 Заблокировать» (non-functional no-op). No backend hooks for some -> must not error.

## Data & endpoints (VERIFIED live on backend :8019)
All need auth (authFetch adds Bearer; readSession() gives {token,role,user_id,email,company_id}).
- GET /dialogs -> list[DialogOut]
- POST /dialogs {participant_id, listing_id?, donor_lot_id?} -> DialogDetailOut
- GET /dialogs/{id} -> DialogDetailOut (listing_id, donor_lot_id, other_participant_name, participants[])
- GET /dialogs/{id}/messages -> list[MessageOut] ascending: {id,dialog_id,author_id,kind,body,offer_id,offer_status,attachment_url,created_at,read}
- POST /dialogs/{id}/messages {kind:'text'|'offer'|'attachment', body?, offer_price?, attachment_url?} -> MessageOut
- POST /dialogs/{id}/read -> {ok:true}
- POST /offers/{offer_id}/accept | /reject -> OfferOut {id,dialog_id,sender_id,price_rub,status,created_at} (only non-sender; 409 if resolved)
- MONEY helper: `(n)=> typeof n==='number' && Number.isFinite(n) ? n.toLocaleString('ru-RU')+' ₽' : ''`

Backend live on http://127.0.0.1:8019 (raw paths, no /api). Frontend calls `authFetch('/api/...')` (vite strips /api). e2e-curl calls raw :8019.

## App.jsx changes
- Add `const isChat = pathname === '/chats' || pathname.startsWith('/chat/')` and append ` pd-app-chat` to the wrapper className.
- Do NOT remove existing routes/nav. Keep /chats and /chat/:id.

## CSS
Add a new scoped section to styles.css (prefix `ch-`, plus `.pd-app-chat` wrapper rules defining the token variables). Implement all reference styles (list, chips, search, dialog rows, avatar gradients, unread badge, pinned item, msgs, day-divider, offer card, attachment, composer, quick-replies, right-panel, info-card, action-btn). Breakpoints: <=800px single col with back; 801-1200px no right panel; >1200px 3-col. NO horizontal overflow at 390px and 1440px. Touch targets >=44px mobile. Do NOT reuse old light pd-chat-* classes for new components.

## Verification (MUST all pass)
1. `npm run build` exit 0.
2. e2e against live backend :8019: register buyer+seller (@gmail.com), seller creates dialog with buyer, exchange text + OFFER, buyer accepts, verify GET /dialogs (unread_count, other_participant_name), GET /dialogs/{id}/messages (offer_status), POST /offers/{id}/accept accepted. Write `backend/_scr6_e2e.sh` (curl+jq) ending `[ "$FAIL" -eq 0 ] && exit 0 || exit 1`. Per-run deterministic (unique $R token in message bodies).
3. Run e2e -> ALL PASS.
4. Playwright Node cjs script `screenshots/scr6_shot.cjs`: log in seller, capture screenshots/scr6-chat-desktop.png (1440px 3-col) + scr6-chat-mobile.png (390px, no h-scroll) + scr6-dialogs-desktop.png. Verify with vision.
5. Save refined spec as _scr6_spec.md.

## Files EXPECTED to change
- frontend/src/pages/Chats.jsx (rebuild dark list)
- frontend/src/pages/ChatView.jsx (rebuild 3-col)
- frontend/src/App.jsx (pd-app-chat wrapper)
- frontend/src/styles.css (new ch-* dark block + pd-app-chat scope)
- backend/_scr6_e2e.sh (new)
- screenshots/scr6-shot.cjs + scr6-*.png
- _scr6_spec.md (this, refined)

Worktree: /home/aifactory/PartsDonor/.worktrees/t_89350a4f (branch wt/t_89350a4f). Backend live on :8019. Vite via `node_modules/.bin/vite --port <fresh>` with BE_PORT=8019. Playwright available. Do NOT use npx.
