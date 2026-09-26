# SCR-4: wizard добавления донора (reference 02) — spec for Pi

Implement the new screen **/donor/new** (wizard добавления донора) per reference 02
(`~/projects/parsdonor/References/ref-parthub/02-add-donor.html`) and the design tokens
in `~/projects/parsdonor/Docs/Design-System-v2.md`. This is a FRONTEND task — the backend
contract (BE-1 wizard) already exists and is unchanged. Do NOT add/alter backend schema or
alembic migrations unless a build/e2e proves it's strictly required (it should not be).

## Base / design system
- Worktree: /home/aifactory/PartsDonor/.worktrees/t_8765d60e (branch wt/t_8765d60e, based on master = SCR-1+BE-5+BE-6+SCR-3).
- Design tokens (copy verbatim, already in styles.css): --bg-0 #050608, --accent #4fa3ff,
  --accent-2 #7cf7d0, --text #f0f3f8, --text-2 #a4adc2, --muted #6a7388, status colors,
  --glass rgba(255,255,255,.04), --stroke rgba(255,255,255,.08), --stroke-2 rgba(255,255,255,.16).
  Dark engineering blueprint; Inter + Courier New for stamps/codes; use `.btn .btn-primary .btn-ghost
  .panel .panel-title .tabs .filter-tabs .chip .modal-overlay .modal` primitives already
  established in frontend/src/styles.css by prior SCR cards (reuse, don't duplicate).
- Follow the conventions of the last SCR (e.g. Storefront.jsx / Cabinet.jsx): page component in
  frontend/src/pages/, routes wired in frontend/src/App.jsx, need-scoped styles appended to
  frontend/src/styles.css with a distinctive prefix (e.g. `wz-*`), responsive mobile+desktop.
- Auth API helper: `authFetch(url, opts)` from frontend/src/auth.jsx (attaches Bearer token).
  All wizard endpoints (donors, uploads, publish) require seller/admin -> use authFetch.
  Public/read-only lookups (device-schemas, donor/{id}) can use plain fetch.
- Relative `/api/...` paths (Vite proxy already forwards /api and /uploads to the backend).
  Image urls from backend come back as `/uploads/<file>` -> render with a leading proxy base.

## Route
- Add `/donor/new` -> new page `frontend/src/pages/DonorWizard.jsx`. Add a "Добавить донора" nav
  entry / link ("Новый донор") reachable from the header nav and/or /cabinet; wire into App.jsx routes.
  Breadcrumb on page: Кабинет / Мои доноры / Новый донор. Top-right: 💾 Черновик and 👁 Предпросмотр buttons.

## Wizard structure (1->4 stepper, top horizontal stepper, always visible)
Steps: 1 Устройство -> 2 Разборка -> 3 Цены и статусы -> 4 Публикация.
A step indicator with active state; "Шаг N из 4" label; sticky bottom bar showing
"<n> деталей · сумма <Σ> ₽" + "Сохранить черновик" + "Опубликовать". Steps clickable back,
next button advances. Save draft available at any step.

### Step 1 — Устройство 📱 (информация о доноре)
- Модель устройства * — dropdown/picker pre-populated from GET /api/device-schemas
  (list of {id, brand, model, inventree_donor_part_id, exploded_view_url, hotspots}).
  Show "<brand> <model>". Selecting a schema captures its id (donor.device_schema_id) and
  enables the blueprint step. Reference lists iPhone 16/16 Pro/16 Pro Max/17/17 Pro Max/S25 Ultra
  as example options; seed/fallback: filter device-schemas by brand ('iPhone', 'Samsung').
  If no device-schemas exist in DB, render a disabled empty state noting the catalog needs a schema.
- Ревизия / парт-номер (revision / part number) — text input (maps to donor.model or provenance note).
- Цвет (color) — segmented chips: Не указан(default) / Чёрный / Белый / Титановый / PRODUCT(RED) / Синий / Зелёный.
- Состояние донора (condition) — chips: После падения / Залитие / Не включается / Рабочее, но разукомплектовано
  -> map to donor.condition (PartCondition).
- Описание донора (description) — textarea.
- Оригинальность компонентов — 3 cards: ✅ Всё оригинал / 🔀 Смешанные / 📋 Копии -> store as provenance.
- 📸 Фото устройства — dropzone (1–10 photos), drag-drop or click; accept JPG/PNG up to 5 MB,
  max 10. On select POST /api/uploads (FormData: file, owner_type=donor, owner_id optional or
  the donor id once created) via authFetch. Show uploaded thumbnails with remove button and sort.
  Caption: "От 1 до 10 фото" / "JPG, PNG · до 5 МБ · максимум 10 фото".

### Step 2 — Разборка по чертежу ⚙️ (blueprint-picker)
- Needs a device_schema with inventree_donor_part_id; if none selected show the graphic placeholder
  "— не выбрано —" and skip to step 3 note.
- Title: "Кликните на деталь, чтобы включить её в лот"; device label "<brand> <model> · РАЗБОРКА".
- Load parts via GET /api/donor/{inventree_donor_part_id} -> DonorSchema {brand, model,
  exploded_view_url, components:[{slot,title,part_id,price_rub,status,hotspot,image}]}.
  Reuse/adapt the exploded-view logic from frontend/src/components/DonorExploded.jsx
  (SVG blueprint + clickable .svg-part zones). Blueprint image from exploded_view_url; overlay
  clickable zones per component (use component.hotspot x,y when present, else distribute slots
  on a fixed grid). Clicking a zone toggles that part into/out of the lot; a selected zone gets a
  highlight ring + appears in the "Детали в лоте" list on the right. Header chip: "Выбрано: N деталей".
- Load currently selected-parts list from the in-memory draft (parts already added).
- "Детали в лоте" side list shows each toggled part (title/slot) with a remove/x and its index.This is the source of truth for step 3's price/status table.

### Step 3 — Цены и статусы 💰
- If step 2 selected zero parts: show empty note "Сначала выберите детали на чертеже (шаг 2)".
- Table of each selected part: title, slot, price input (₽), status pill/select (в наличии / под заказ / нет),
  remove. Live-update: row price edits -> recompute лот sum. Status maps to listing status values
  used by the backend (active/...; use the same labels as existing listings/Storefront: в наличии=active(green),
  под заказ=yellow, нет(sold?/none)=red — check existing status label dicts and reuse).
- Determining donor.price_rub: total = sum of part prices; donor price_rub = that total (rhs of lot).

### Step 4 — Публикация 🚀 (параметры публикации)
- Город (city) — text input.
- Срок продажи — segmented: 7 дней / 14 дней / 30 дней / Без ограничений.
- Условия — toggles/chips: Продажа целиком (лот-донор) / Продажа поштучно / Гарантия на детали.
- Показывать в рознице (B2C) / Показывать мастерам и сервисам (B2B) — switches.

### 👁 Предпросмотр (должен быть доступен с любого шага — modal or side panel .modal)
Preview card matching reference: 📱 icon, "Новый донор", device short title "Выберите модель" until a
schema is chosen then "<brand> <model>", description/condition/provenance line, "Деталей в лоте" count,
"Сумма поштучно" Σ part prices, "Комиссия платформы (5%)" = round(Σ*0.05,2), "Вы получите" = Σ - комиссия.
Commission math: комиссия(5%) = сумма*0.05; вы получите = сумма - комиссия (show ₽).
Also show "Советы" tip panel (bullets from reference: про описание/фото, остаточную ёмкость АКБ,
отмечать если плата не восстанавливалась, мастера берут лот целиком — розница поштучно).
Sticky bottom bar: "N деталей · сумма Σ ₽ | Сохранить черновик | Опубликовать".

## Persistence / API flow
- **Save draft (Черновик)**: POST /api/donors (DonorIn: device_schema_id, brand, model, title,
  price_rub=Σ, condition, provenance, parts=[{slot,title,inventree_part_id,price_rub,status,sort}])
  via authFetch -> get donor.id. Then POST /api/donors/{id}/parts for any parts added after;
  PATCH /api/donors/{id} to update fields; associate uploaded photos by re-POSTing to
  /api/uploads with owner_id=donor.id (or PATCH the Photo owner). Keep the donor.id in state so
  save is update-not-insert on repeat. On save show a toast "Черновик сохранён".
- **Опубликовать**: ensure draft saved (create if needed) then POST /api/donors/{id}/publish
  -> DonorPublishOut {donor, donor_lot_id, message}. On success toast "Донор опубликован" and
  navigate to the storefront/donor-lot or /donor-lots. If missing device_schema_id the backend
  400s ("Для публикации нужен device_schema_id") — surface a friendly error and block publish.
- Components status/price from the selected blueprint parts feed DonorPartIn rows.

## Verification (MUST be runnable independently)
1. `cd frontend && npm run build` -> exit 0, ~50+ modules, no errors.
2. Backend untouched: `python3 -m py_compile backend/app/main.py backend/app/schemas.py` clean.
3. Adaptive: mobile (400px) + desktop (1440px) screenshots via Playwright (follow the pattern of
   the committed screenshots/scr3_storefront script: a .cjs Playwright script rendering the built
   app) saved to screenshots/scr4-wizard-{desktop,mobile}.png — confirm no horizontal overflow,
   stepper wraps, panels stack on mobile. You may build the wizard with mock/local state so the
   screenshot doesn't need a live backend (but real API calls should still be wired for a full run).
4. Optionally an e2e-curl against a freshly started backend verifying POST /donors -> 201,
   POST /donors/{id}/publish etc. (auth seller token) — write as backend/_scr4_e2e.sh if done.

## Deliverables
- frontend/src/pages/DonorWizard.jsx (new)
- frontend/src/App.jsx (route + nav link)
- frontend/src/styles.css (wz-* styles, appended)
- screenshots/scr4-wizard-{desktop,mobile}.png
- _scr4_spec.md, optional backend/_scr4_e2e.sh + out
- Commit on wt/t_8765d60e.

Constraints: flash model, keep backend untouched, npm run build green, mobile+desktop adaptive,
follow the established SCR conventions in the repo (read Storefront.jsx / Cabinet.jsx / styles.css first).
Report final output with file paths + build/e2e results.
