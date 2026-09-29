# PartsDonor PRESET-2: Модальный редактор пресетов — спецификация для Pi

Repo: /home/aifactory/PartsDonor/.worktrees/t_eb31343a  (Vite/React, frontend in frontend/)
Branch: wt/t_eb31343a  (PRESET-1 9af1882 ALREADY merged — multi-shape `shapes[]` present)

## TL;DR
Build a MODAL preset editor. When the user clicks a new "Редактировать пресеты" button in the presets panel header, a dark overlay modal opens containing a full editor for the parts presets (name, category, and the list of composed shapes — add/remove/reorder, edit type/coords/size/fill/z), with a live SVG preview. Changes persist to localStorage and are immediately reflected in the presets panel + click-to-add on the canvas.

## Codebase facts (verify before editing but DO NOT trust stale memory)
- `frontend/src/presets.js` — exports `PRESET_CATEGORIES` (array of {id,label}) and `PRESETS` (array). After PRESET-1 each preset is:
  ```js
  { key: 'battery', name: 'RU name', cat: 'battery', shape: 'rect', g: {x,y,w,h,rx} (legacy single), fill:'#..', z: 6,
    shapes: [ { shape:'rect', g:{...}, fill:'#..', z:7 }, {shape:'circle',g:{cx,cy,r}}, {shape:'ellipse',g:{cx,cy,rx,ry}}, {shape:'polygon',g:{points:[[x,y],...]}} ] }
  ```
  - NOTE: every preset has BOTH legacy `shape`+`g`+`fill`+`z` AND (for 29) a `shapes[]` array. When editing a preset that HAS `shapes[]`, treat `shapes[]` as the source of truth for composition; keep the legacy fields in sync (regenerate the legacy `shape`/`g`/`fill`/`z` from a chosen primary sub-shape or just leave them — the editor works off `shapes[]`). A preset WITHOUT `shapes[]` must be converted to `shapes:[{shape,g,fill,z}]` when opened in the editor so the shape-list UI is uniform.
- `frontend/src/pages/BlueprintEditor.jsx` — main editor page. Relevant pieces:
  - `import { PRESETS, PRESET_CATEGORIES, polygonPointsToFigures } from '../presets.js'` (line ~4)
  - `function PresetIcon({ preset })` (~line 192) renders the mini preview — handles `shapes[]` (rect/circle/ellipse/polygon) and legacy single-shape. REUSE its geometry logic for the modal live preview (or extract a shared `<PresetSvg preset={p}/>` that both PresetIcon and the modal preview use — cleaner; keep PresetIcon behavior identical).
  - Editor component `export default function BlueprintEditor()` (~line 234). State: `presetCat` for the filters, `filteredPresets` computed from `PRESETS` (line ~612), `.bld-presets-head` header (~line 686), `.bld-presets-cats` tabs, `.bld-presets-grid` with `addPreset(p)` onClick.
  - `addPreset(preset)` (~585) adds a figure/group to the canvas. Keep it working with edited presets unchanged.
- `frontend/src/styles.css` — all `.bld-*` styles live here (dark theme). Tokens available: `--bg-0 #050608, --accent #4fa3ff, --text, --text-2 #a4adc2, --muted #6a7388, --green #22c55e, --red #ef4444, --glass rgba(255,255,255,.04), --stroke rgba(255,255,255,.08), --stroke-2`. Existing modal pattern to model on: `.pd-modal`/`.pd-modal-overlay` (styles.css ~1441/1639): `position:fixed; inset:0; background:rgba(15,23,42,.5); display:flex; align-items:center; justify-content:center; padding:16px; z-index:100`. For THIS task use `.bld-modal*` class names (per spec) with the same dark-overlay visual.

## What to build
### 1. Button in presets panel header
In `.bld-presets-head` (currently just label + count at ~line 686) add a button `✏️ Редактировать пресеты` (class e.g. `.bld-presets-edit`) that sets editor state `setPresetEditorOpen(true)`.

### 2. App-level preset state (NOT the static PRESETS directly)
The spec requires: PRESETS is a static module — do NOT mutate it. Keep an app-level copy in BlueprintEditor state and use THAT for the panel + addPreset:
- `const [presetList, setPresetList] = useState(() => loadPresets())` where `loadPresets()` returns `[...PRESETS, ...customFromLocalStorage]` (custom loaded on top of defaults, keyed by `key` — a custom preset whose `key` matches a default REPLACES it in place; carry a flag `custom:true` on it so the editor marks it as editable/deletable).
- Persist CUSTOM presets (added + edited + deleted) to localStorage under `pd-presets-custom` (JSON array).
- Panel rendering + `filteredPresets` + `addPreset` must now read from `presetList` state instead of the static `PRESETS` import. Pass `presetList` down so the modal edits it via the same setter.
- Deletion: any preset can be deleted, but show a confirm (`window.confirm('Удалить пресет «name»?')`). Deleting a default re-marks it deleted so it doesn't reappear on reload (persist a `deletedKeys` list in localStorage too, or re-store the full custom list with tombstones — your choice, must be reload-surviving). Keep it simple and correct.

### 3. The modal editor (`PresetEditorModal`) — open over dark overlay
Props: `{ open, presets, setPresets, onClose }` (or lift state; pick clean approach). Layout (left list / right editor is a good option):
- **Left: list** — category filter (reuse PRESET_CATEGORIES tabs or a select) + scrollable list of presets (icon + name). Click to select for editing. A "+ Добавить пресет" button creates a new empty preset (generate a fresh `key` e.g. `custom-<uid>`, default `shape:'rect'`, `g:{x:30,y:30,w:80,h:60,rx:6}`, `fill:'#4fa3ff'`, `z:5`, `shapes:[{shape:'rect',g:{x:30,y:30,w:80,h:60,rx:6},fill:'#4fa3ff',z:5}]`, `custom:true`).
- **Right: editor for the selected preset**:
  - Fields: Название (`name` text input), Категория (`cat` select from PRESET_CATEGORIES).
  - **Shapes list**: each sub-shape row shows: type (select rect/circle/ellipse/polygon), the relevant geometry inputs (rect: x,y,w,h,rx; circle: cx,cy,r; ellipse: cx,cy,rx,ry; polygon: a compact points editor — textarea of "x,y" pairs per line), fill (color text input + a few swatches), z (number). Controls: «↑/↓» reorder (changes z order in array), «✕» delete shape, «+ Добавить фигуру» appends a default sub-shape. Geometry inputs can be number inputs (parse float).
  - **Live preview**: a mini `<svg viewBox="0 0 340 640">` rendering the CURRENT `shapes[]` (reuse/extract the same composition logic as PresetIcon so it matches the panel thumbnail) that updates on every keystroke.
- **Save / Cancel** buttons: Cancel = close without applying any unsaved edits. Save = write edited preset back into `presetList` (replacing by `key`, or appending for new), persist to localStorage, close.
- Editing UX recommendation: edit a WORKING COPY in local modal state; only apply to `presetList` on Save. (Simplest correct approach; matches "Сохранить/Отмена".)

### 4. Styles in styles.css (`.bld-modal*`)
Dark theme, consistent with existing `.bld-*` and `.pd-modal` overlay: overlay `.bld-modal-overlay` = fixed inset-0, rgba(15,23,42,.5), z-index 100+, flex center; panel `.bld-modal` = dark glass background (var(--glass)/#0c1016), border var(--stroke), radius ~14px, large max-width/height (e.g. 980px x 640px) with internal scroll. Style list, editor rows, inputs (reuse `.pd-input` look via `.bld-props` styling), buttons (`.pd-btn` available), the add-figure/del/reorder controls, and the preview.

## Acceptance criteria (MUST all hold)
- The button opens the dark-overlay modal editor.
- Add / delete / edit a composed shape (type, coords/size, fill, z, order) works inside the modal.
- Edit preset name and category.
- Live preview updates on change.
- Changes are immediately reflected in the presets panel and click-to-add on canvas.
- Persist to localStorage (`pd-presets-custom`); custom presets survive reload.
- Main canvas/tools NOT cluttered — everything lives inside the modal.
- Vite build passes (exit 0).

## Deliverables (write real files, then VERIFY)
- Edit `frontend/src/pages/BlueprintEditor.jsx`, `frontend/src/presets.js` (only if you must — prefer keeping presets.js defaults intact and overlaying in BlueprintEditor), `frontend/src/styles.css`.
- `npm run build` (in frontend/) must exit 0. NOTE the shell guard: don't print the raw word 'vite' inline — run `cd frontend && npm run build > /tmp/preset2_build.log 2>&1; echo $?` (use write-then-run pattern if needed).
- OPTIONAL but encouraged: spin up the dev server on a FRESH port (shared dev 5173 may be serving STALE code from another worktree — use e.g. `--port 5202 --strictPort`) and do a quick browser sanity check (open /editor, click the edit button, confirm modal, edit a value, confirm preview + panel update). If you do browser verification, log the port used.
- Leave a short summary at `.pi/tasks/preset2_done.md` with what changed, build result, and any verification notes.

## Constraints
- Keep backward compat: saved schemes / addPreset path must keep working. Don't break `polygonPointsToFigures` usage.
- Dark theme, Russian UI text (all user-visible strings in Russian, matching existing like «Пресеты», «Аккумулятор»).
- Do not reformat unrelated code. Touch only what the task needs.
- Commit your work ON THE CURRENT BRANCH (wt/t_eb31343a) in small logical commits as you go (protects against workspace pruning).
