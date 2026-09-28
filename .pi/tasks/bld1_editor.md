TASK: Implement BLD-1 for the PartsDonor app — a 'Конструктор схемы' (blueprint/scheme drawing editor) page. The worktree is at /home/aifactory/PartsDonor/.worktrees/t_32a4db88 (branch wt/t_32a4db88). This is a Vite/React frontend in frontend/src and a FastAPI backend in backend/app.

=== CONTEXT: HOW THE APP IS STRUCTURED ===
- App.jsx (frontend/src/App.jsx): React Router with code-split lazy routes. Each page is imported via React.lazy(() => import('./pages/X.jsx')) and added to the <Routes> block. There are two sections: the lazy imports at top (e.g. const DonorView = React.lazy(() => import('./pages/DonorView.jsx'))), and the <Route path=... element=... /> entries inside <Routes>.
- Pages live in frontend/src/pages/. The seller cabinet is frontend/src/pages/Cabinet.jsx (header 'Кабинет продавца'). Entry link for the new editor should be added there.
- Design system: dark 'blueprint' theme. CSS tokens in :root at frontend/src/styles.css line 1659: --bg-0 #050608, --accent #4fa3ff, --accent-2 #7cf7d0, --text #f0f3f8, --text-2 #a4adc2, --muted #6a7388, --green #22c55e, --yellow #fbbf24, --red #ef4444, --blue #60a5fa, --glass rgba(255,255,255,.04), --stroke rgba(255,255,255,.08), --stroke-2 rgba(255,255,255,.16). Buttons: .btn, .btn-primary, .btn-sm, .btn-ghost. Inputs: .pd-input, .pd-field, .pd-label. Existing SVG blueprint components to reference for drawing-style: frontend/src/components/BlueprintExploded.jsx (has <svg> parts with dark gradients) and frontend/src/components/DonorBlueprintMini.jsx.
- Backend: frontend calls authFetch('/api/...') or fetch('/api/...'); Vite dev proxy strips /api and forwards to backend port 8001. The FastAPI app is backend/app/main.py, models in backend/app/models.py, Pydantic schemas in backend/app/schemas.py.
- Models: there is a DeviceSchema model (backend/app/models.py line 158) with fields: id (uuid pk), brand String(64), model String(128), inventree_donor_part_id Int nullable, exploded_view_url Text default '', hotspots JSON default dict, created_at. Restful routes already exist at backend/app/main.py: GET/POST /device-schemas and GET /device-schemas/{id} (lines 888-915). The DeviceSchemaIn schema (schemas.py line 45) has brand, model, inventree_donor_part_id, exploded_view_url, hotspots.

=== WHAT TO BUILD ===

1. NEW PAGE frontend/src/pages/BlueprintEditor.jsx — an SVG drawing editor ('Конструктор схемы').
   - SVG canvas with viewBox="0 0 340 640" (portrait phone outline as the background frame, like the blueprint). Render a phone outline rect as the backdrop; drawn shapes layer on top.
   - Drawing tools toolbar: Pencil-shape tools = rectangle (rect), circle/ellipse (circle or ellipse), free polygon/arbitrary shape (polyline/polygon), lasso/select (select mode for moving/resizing existing shapes). Click+pointer-drag on the canvas creates a shape (mousedown => start, mousemove => preview, mouseup => commit).
   - Each drawn shape is selectable; in select/lasso mode clicking a shape selects it and lets you DRAG to move it and RESIZE via drag handles (resize markers). Keep it reasonable/simple but functional: at minimum drag-to-move the selected shape, and a resize handle that scales/expands it.
   - Every shape = a future 'part': each committed shape gets a property panel where the seller can set a NAME (название) and a KEY identifier (key-идентификатор). Selected shape shows its editable name/key fields.
   - Color palette: each shape needs an availability state for display — at least 2: green (в наличии) and red (нет в наличии). While drawing, the user can freely pick the shape color/fill. Provide a small palette of color swatches (e.g. the blueprint colors, plus green/red availability colors) that set the new shape's fill stroke.
   - Save: a 'Сохранить схему' button POSTs to the backend. The saved payload = SVG data (the full <svg> markup or a serializable shape list with type/geometry/name/key/color) + the list of shapes. Use POST /api/device-schemas with body matching DeviceSchemaIn shape: { brand, model, exploded_view_url (set to the SVG string), hotspots: {...} , plus the figure list }.

    IMPORTANT engineering decision (make it clean): store the full serializable figure list (array of {id, type: 'rect'|'circle'|'ellipse'|'polygon', x,y,w,h / cx,cy,r, points, name, key, fill, stroke}) AND the generated SVG markup so the page can be reloaded/repopulated. Add a 'Загрузить' / load capability if it returns from the save response, so drawn figures persist (state in component memory across edits is enough for in-session; full backend persistence via the POST is the required acceptance). Keep scope tight: focus on drawing rect+circle, editing (drag/resize), properties (name/key), color palette, and POST-save. Do NOT wire real model binding (that's a separate BLD-3 task) — just POST the device schema object.

2. ROUTE: Register in frontend/src/App.jsx — add lazy import + <Route path="/editor" element={<BlueprintEditor />} />. Follow the existing code-split pattern.

3. ENTRY FROM SELLER CABINET: Add a visible link/button in frontend/src/pages/Cabinet.jsx ('Кабинет продавца') like a header button or a widget, e.g. a <NavLink to="/editor">Конструктор схем</NavLink> using .btn / .btn-primary styling. Place it near the top widgets area. Also add the editor link into the global top nav in App.jsx HeaderNav is optional — a Cabinet entry is REQUIRED, global nav optional (add it too if easy, as a <NavLink to="/editor">Конструктор</NavLink>).

4. STYLES: Add the editor's CSS to frontend/src/styles.css (append a clearly-commented new section at the end, e.g. /* ---- BLD-1: Blueprint Editor ---- */). Use the :root tokens and .pd-* / .btn classes. The editor must be ADAPTIVE: on desktop show toolbar left/right of the canvas; on mobile (max-width breakpoint) stack toolbar above the canvas. Dark blueprint theme throughout.

5. ACCEPTANCE (must all be real and verified):
   - /editor opens and shows an SVG canvas.
   - Can draw a rectangle and a circle; they persist on the canvas and can be edited (drag to move, resize).
   - Drawn figures have properties (name, key) shown/editable in a panel.
   - Scheme can be saved (SVG data + figure list) to the backend via POST /api/device-schemas — backend must accept it. Verify by actually POSTing via the running backend (127.0.0.1:8001) and confirming a 2xx + row persisted.
   - Style matches PartHub dark blueprint.

=== IMPORTANT WORKING RULES ===
- Work in the worktree /home/aifactory/PartsDonor/.worktrees/t_32a4db88. COMMIT EARLY AND OFTEN on branch wt/t_32a4db88 (git add -A && git commit). The worktree can be pruned mid-run; commits to the shared git object store survive.
- Do NOT break existing pages/routes, do NOT touch InvenTree directly (always via backend API), do NOT do BLD-4 presets or BLD-3 model binding.
- Build verification: use the real frontend dev server + running backend. Backend should be at 127.0.0.1:8001 (verify with curl http://127.0.0.1:8001/docs or a GET). If the backend isn't running, note it. For browser verification use Playwright via node (write a .cjs script, run with node, NOT pytest) to load the dev server (start vite on a FRESH port with BE_PORT set, e.g. BE_PORT=8001 node_modules/.bin/vite --port 5179 --strictPort, verify with curl) and assert: /editor renders the svg, drawing a rect + circle produces <rect> and <circle> nodes that persist, moving a shape changes its geometry, and the save button POSTs to the backend. Read the vite project before running.
- The apiFetch pattern: read an existing page to copy exactly how it calls the backend (authFetch from './auth.jsx' vs plain fetch) and reuse the same helper and base URL convention.

=== REPORT ===
Report: list every file created/modified, the exact route, how save works (endpoint + payload), and the verification evidence (commands + their real output: curl status, playwright assertions). If backend was not reachable for the save-verify, state precisely what was verified vs not.

IMPORTANT FINAL STEP: after all edits and verification, git add -A && git commit -m 'feat(blueprint-editor): BLD-1 scheme drawing editor (SVG canvas, rect/circle/polygon, edit+resize, color palette, POST save)' on the wt/t_32a4db88 branch, and print the final git log --oneline -3.
