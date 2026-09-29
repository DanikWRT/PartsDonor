# PRESET-3 — Layout: canvas LEFT, control panel RIGHT — DONE

## What changed
### `frontend/src/pages/BlueprintEditor.jsx`
Restructured the `bld-layout` block (pure JSX relocation/wrapping — no logic/
presets/tools touched):
1. **`bld-canvas-wrap`** (SVG blueprint canvas) is now the **FIRST** child — LEFT, dominant column.
2. New **`<aside className="bld-control" aria-label="Панель управления">`** wraps the
   existing three asides stacked vertically, in this order: `bld-toolbar` (Инструменты /
   Цвет-наличие / view-mode note), `bld-presets` (Пресеты), `bld-panel` (Свойства /
   Сохранение / Карточка / Загрузить).

All inner JSX, aria-labels, classes, and function bindings preserved exactly — only relocated + wrapped.

### `frontend/src/styles.css`
- `.bld-layout`: `display:grid; grid-template-columns: minmax(0,1fr) 400px; gap:18px;
  align-items:stretch; height:calc(100vh - 220px); min-height:560px;` (stable full-height frame).
- NEW `.bld-control`: `display:flex; flex-direction:column; gap:14px; overflow-y:auto;
  min-height:0; padding:2px 2px 6px;` — the single vertical scroller for the right sidebar.
- `.bld-canvas-wrap`: stays a centered glass card; added `min-height:0; overflow:auto` so a
  tall canvas never breaks layout.
- `.bld-canvas`: `max-width:340px → 480px` — canvas is left-dominant (wider than the 400px control).
- `.bld-presets`: removed `max-height:720px` / `overflow:hidden` → `max-height:none; overflow:visible; flex:none`
  (primary scroller is now `.bld-control`; grid still keeps its own overflow as fallback).
- Responsive `@media (max-width:900px)`: `.bld-layout{grid-template-columns:1fr; height:auto; min-height:0}`,
  canvas `order:-1` (first), `.bld-control{order:1; overflow:visible; max-height:none; padding:0}` so
  mobile stacks control panel BELOW the canvas; existing horizontal toolbar wrap + presets grid preserved.
- `@media (max-width:560px)` unchanged (clean stacking).

Dark PartHub style kept: `var(--glass)`/`var(--panel)` cards, 1px `var(--stroke)`, tidy padding/rounding. All labels Russian.

## Verification
1. **Build**: `cd frontend && npm run build` → **exit 0** (✓ built in 1.27s).
2. **Playwright** (Chromium, dev server `--port 5203 --strictPort`, BE on 8001) — **ALL PASS**:
   - desktop 1280px: canvas bbox LEFT of control, canvas wider than control (480 > 400), control on right ✓
   - toolbar/presets/panel all present inside control; section labels present ✓
   - preset click → figure added to canvas (0→1) ✓
   - «✏️ Редактировать пресеты» → modal opens; closes via close button ✓
   - view mode → control updates (Режим просмотра note + Карточка детали) ✓
   - mobile 480px: control panel stacked BELOW canvas ✓
   - page errors: none ✓
3. Port used for dev server: **5203** (killed after run).

## Commits (branch `wt/t_aba468d9`)
- `828d0c8` chore(preset3): add task spec
- `a8139da` feat(blueprints): PRESET-3 - JSX restructure (canvas left, wrap toolbar+presets+panel in bld-control)
- `3a12a6f` feat(blueprints): PRESET-3 - two-column layout CSS
- `f951461` docs(preset3): verification summary

## Notes
- `frontend/node_modules` was already present (not a symlink created here) → not in diff.
- Only `BlueprintEditor.jsx` + `styles.css` modified.
