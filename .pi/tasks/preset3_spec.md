# PartsDonor PRESET-3: Лейаут — холст (эскиз) слева, панель управления (пресеты+инструменты) справа

Repo: /home/aifactory/PartsDonor/.worktrees/t_aba468d9  (Vite/React, frontend in frontend/)
Branch: wt/t_aba468d9  (PRESET-2 6c3cdb0 ALREADY merged — modal editor + shapes[] + presets panel present)

## TL;DR
Restructure the BlueprintEditor page layout to match the donor-page (как на /donor): a DOMINANT canvas (эскиз/blueprint-рамка телефона) on the LEFT spanning full height, and a WIDE CONTROL PANEL on the RIGHT that combines the tools + color/наличие + presets grid + properties/save into ONE vertically-scrollable sidebar column. Pure layout change — DO NOT touch presets/tools logic.

## Current state (verify in code before editing)
`frontend/src/pages/BlueprintEditor.jsx` line ~786 `<div className="bld-layout">` contains these 4 siblings IN THIS DOM ORDER:
1. `<aside className="bld-toolbar">`  — Инструменты (TOOLS), Цвет/наличие (PALETTE), hint; in view mode instead shows «Режим просмотра» note.
2. `<aside className="bld-presets">` — Пресеты: header («Пресеты» label + count + «✏️ Редактировать пресеты»), category tabs, presets grid.
3. `<div className="bld-canvas-wrap">` — the SVG canvas (blueprint phone frame).
4. `<aside className="bld-panel">` — Свойства фигуры / Сохранение схемы / Карточка детали / Загрузить.

`frontend/src/styles.css`:
- line 4925 `.bld-layout { display: grid; grid-template-columns: 200px minmax(0,1fr) 210px 260px; gap: 20px; align-items: start; }`  → 4 columns: toolbar | canvas | presets | panel.
- `.bld-toolbar, .bld-panel` share a glass card style (line 4928).
- `.bld-presets` (line 5050) is its own `--panel` card with `max-height:720px; overflow:hidden` and `.bld-presets-grid{overflow-y:auto}`.
- `.bld-canvas-wrap` (line 4955) centers the `.bld-canvas` (max-width 340px).
- Existing responsive: `@media (max-width:900px)` sets `.bld-layout{grid-template-columns:1fr}`, reorders via `order`, makes toolbar wrap horizontally, presets max-height none. `@media (max-width:560px)` minor.

Dark-theme tokens: `--bg-0 #050608, --accent #4fa3ff, --text, --text-2 #a4adc2, --muted #6a7388, --green #22c55e, --red #ef4444, --glass rgba(255,255,255,.04), --panel, --stroke rgba(255,255,255,.08), --stroke-2`. PartHub dark aesthetic: dark panels, glass, tidy padding.

## DESIGN DECISION (decided by orchestrator — implement exactly this)
Two-column layout: **canvas LEFT (dominant), control panel RIGHT (single scrollable sidebar).**

### JSX restructure (BlueprintEditor.jsx, `bld-layout`)
Reorder + wrap so the DOM becomes:
1. `<div className="bld-canvas-wrap">` FIRST (left column).
2. `<aside className="bld-control" aria-label="Панель управления">` LAST (right column) — wrap the EXISTING toolbar + presets + panel inside it, in this order: `bld-toolbar`, then `bld-presets`, then `bld-panel`, stacked vertically (each keeps its own labels/sections).
This means: move the `bld-canvas-wrap` block (STAYS exactly as-is, just moves to be the first child) and wrap the other three `<aside>` blocks in one `<aside className="bld-control">`. Do NOT change any of their inner JSX/logic — only relocate + wrap. Preserve every `aria-label`, class, and function binding exactly.

### CSS (styles.css)
- `.bld-layout`: `display:grid; grid-template-columns: minmax(0,1fr) 400px; gap:18px; align-items:stretch;` and give it a stable full-height frame so the right sidebar can scroll: `height: calc(100vh - 220px); min-height: 560px;` (approx — header + page padding; tune so it fits below the page header. If `100vh` feels off, use a large `max-height` on `.bld-control` instead so the canvas never squeezes below the fold). The LEFT canvas column should be visible full height; the RIGHT `.bld-control` is the single vertical scroller.
- `.bld-canvas-wrap`: stays a centered card. Make the canvas column dominant (`minmax(0,1fr)`), let `.bld-canvas` grow (`max-width` up to ~480px or `width:100%` with larger max) so the эскиз is large and left-dominant.
- NEW `.bld-control`: `display:flex; flex-direction:column; gap:14px; overflow-y:auto; min-height:0; padding:2px 2px 6px;` (allow internal scroll). Remove the old per-panel `max-height`/`overflow:hidden` on `.bld-presets` (let the whole right column scroll) OR keep a modest `max-height:none`. `.bld-presets-grid` may keep its own overflow as a fallback but the primary scroller is `.bld-control`.
- Keep the glass/card look: toolbar/presets/panel keep their card backgrounds (var(--glass)/var(--panel)) and 1px var(--stroke) borders.
- Header row of the editor: if `bld-head` (`h2` + sub) is above `bld-layout`, keep it there; just make the layout fill remaining height.

### Responsive (preserve mobility — do NOT break)
- `@media (max-width: 900px)`: `.bld-layout{grid-template-columns:1fr; height:auto; min-height:0;}` and put canvas FIRST, control panel BELOW it: `.bld-canvas-wrap{order:-1}`, `.bld-control{order:1; overflow:visible; max-height:none;}` keep toolbar wrap horizontal etc. The mobile behavior (toolbar/flex-wrap, presets grid `repeat(auto-fill,minmax(140px,1fr))`) already exists — preserve it, apply to the new structure (e.g. `.bld-toolbar{flex-direction:row; flex-wrap:wrap}` still works because `.bld-control` is a column that can hold a horizontally-wrapped toolbar — verify visually).
- `@media (max-width:560px)`: keep minor tweaks; ensure canvas/control stack cleanly.

## Constraints
- DO NOT change presets/tools/color/availability LOGIC — layout only (CSS + JSX relocation/wrapping).
- All user-visible strings stay Russian. Dark PartHub style. Tidy padding/rounding consistent with existing cards.
- Don't reformat unrelated code. Touch only BlueprintEditor.jsx (layout block) + styles.css (bld- layout styles).
- Preserve backward/forward behavior: editing, save, preset add/click-to-add, view mode all keep working identically — only position changed.

## Acceptance criteria (MUST all hold)
1. Canvas/эскиз on the LEFT, dominant width; presets + tools control panel on the RIGHT — like /donor.
2. Right panel scrolls vertically when presets are many; canvas stays visible (spanning height).
3. All tools + presets still present & functional (edit/reorder/add/filter/palette/color/save/load).
4. Responsive preserved: mobile (<~900px) stacks control panel below the canvas; desktop two-column.
5. Dark PartHub style, tidy.

## Verification (REQUIRED — run real checks)
1. Build: `cd frontend && npm run build > /tmp/preset3_build.log 2>&1; echo $?` must print 0. (Shell guard: do not print raw 'vite' inline; redirect output.)
2. Live browser check with Playwright (node script written via write_file, run as `node <script>.cjs`):
   - Launch dev server on a FRESH port with `--strictPort` (e.g. 5203): `cd frontend && BE_PORT=8001 node_modules/.bin/vite --port 5203 --strictPort > /tmp/preset3_dev.log 2>&1 &`. NOTE the shared dev 5173 may serve STALE code. If `frontend/node_modules` is missing in the worktree, symlink it from the primary tree first: `ln -sfn /home/aifactory/PartsDonor/frontend/node_modules frontend/node_modules` (remember to `git rm --cached frontend/node_modules && git commit --amend --no-edit` later if it shows in git diff).
   - Assert: at desktop width (~1280px) the canvas bounding box is LEFT of the control panel bbox AND canvas is wider than control panel (dominant). Control panel is to the right. Switch to view mode; confirm panel updates.
   - Assert at mobile width (~480px): control panel bbox is BELOW canvas bbox (stacked).
   - Confirm all control sections present: Инструменты, Цвет / наличие, Пресеты grid (categories + cards), Свойства/Сохранение.
   - Click a preset → a figure is added to the canvas (logic intact). Click «✏️ Редактировать пресеты» → modal opens (logic intact).
   - PAGE ERRORS: none.
   - Kill the dev server after.
3. Leave a summary at `.pi/tasks/preset3_done.md` (what changed, build result, verification notes, port used).
4. Commit on branch wt/t_aba468d9 in small logical commits (protect against workspace pruning). Ensure `frontend/node_modules` symlink (if created) is NOT committed.
