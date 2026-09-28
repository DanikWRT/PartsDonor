# PartsDonor BLD-3: привязка схемы к модели (brand+model) + редактирование существующих схем

## WORKTREE / ENV FACTS (verified 2026-09-29, do not re-derive)
- Worktree: /home/aifactory/PartsDonor/.worktrees/t_736f258b, branch wt/t_736f258b.
- Frontend: Vite/React in frontend/src. Backend: FastAPI in backend/app. Design system tokens in frontend/src/styles.css :root (dark 'blueprint' theme, .btn/.pd-* classes).
- BACKEND VENV lives ONLY in primary tree: use `/home/aifactory/PartsDonor/backend/.venv/bin/python` and `.../bin/alembic` (run them from the worktree backend dir). The worktree backend dir has NO .venv.
- frontend/node_modules in the worktree is a symlink to /home/aifactory/PartsDonor/frontend/node_modules (already set up this session). It shows as a tracked FILE in git status — see COMMIT rules at the bottom.
- The live shared backend on 127.0.0.1:8001 runs the PRIMARY tree code (cwd /home/aifactory/PartsDonor/backend), NOT this worktree. So changes you make here will NOT appear on 8001. For verification you must START YOUR OWN backend from this worktree on a FRESH port (see VERIFY) and point the Vite dev proxy's BE_PORT at it (default BE_PORT is 8001 — run vite with BE_PORT=<yourport>).
- Shared DB is POSTGRES (NOT sqlite): postgresql+asyncpg://pduser:pdpass@localhost:5433/partsdonor (from PARTSDONOR_DATABASE_URL in backend/.env). `alembic current` on it = `scr2_cabinet`. The migration FILE for scr2_cabinet is MISSING from every accessible worktree (it lived in a pruned/legacy worktree) — see MIGRATION strategy below.
- Existing model pattern: backend/app/models.py has class DeviceSchema(Base) at line ~151 (columns id uuid pk, brand String(64), model String(128), inventree_donor_part_id Int?, exploded_view_url Text default '', hotspots JSON default dict, created_at). POST/GET /device-schemas and GET /device-schemas/{id} already exist in backend/app/main.py (lines ~887-914). These stay working (BLD-1/BLD-2 rely on them).
- Existing device_schemas rows in DB (real data): ('Apple','iPhone 13 Pro', inventree_donor_part_id=1) plus leftover test rows (BLD1Verif/EditorPro, BLD2Verif/*, T/M) — ignore/keep them, do not clear.
- logger: use `logging.getLogger("uvicorn")` or print via the existing style in main.py.

## GOAL
A phone scheme ('blueprint') binds to a specific model (brand+model), is stored in the backend, and can be EDITED (load existing + change figures + re-save). This is a NEW entity distinct from DeviceSchema.

## BACKEND WORK (files: backend/app/models.py, backend/app/schemas.py, backend/app/main.py, + new migration + stubs)
1. New SQLAlchemy model `Blueprint` in backend/app/models.py (register in Base.metadata by just defining it, matching the DeviceSchema style):
   - __tablename__ = "blueprints"
   - id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
   - brand: Mapped[str] = mapped_column(String(64))
   - model: Mapped[str] = mapped_column(String(128))
   - svg: Mapped[str] = mapped_column(Text, default="")   # полный SVG-маркер (markup), как exploded_view_url у DeviceSchema
   - parts: Mapped[list] = mapped_column(JSON, default=list)  # сериализуемый массив фигур [{id,type,x,y,w,h|cx|cy|r|points,name,key,fill,stroke}, ...]
   - created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
   - updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
   (imports needed: uuid, datetime, func, JSON, UUID, Text are all already imported in models.py — reuse them.)
2. Pydantic schemas in backend/app/schemas.py:
   - BlueprintIn(BaseModel): brand: str, model: str, svg: str = "", parts: list = []
   - BlueprintOut(BaseModel): id: uuid.UUID, brand, model, svg, parts: list, created_at: datetime, updated_at: datetime; model_config = {"from_attributes": True}
3. New router endpoints in backend/app/main.py (keep REST style of existing code; same `router` APIRouter prefix is used across the file — these are NOT under /api in the backend source; the Vite proxy strips /api):
   - GET  /blueprints -> list[BlueprintOut] ordered by created_at desc (like list_device_schemas)
   - POST /blueprints (status_code=201) -> BlueprintOut   # create; brand/model from payload
   - GET  /blueprints/{brand}/{model} -> BlueprintOut     # exact match on brand AND model; 404 if none
   - PUT  /blueprints/{id} -> BlueprintOut                # update svg/parts (and allow brand/model rename too); 404 if id not found; set updated_at
   Handle brand/model matching case-insensitively for the GET-by-brand-model (the frontend will pass the slug-normalized / display forms; match normalized). Return 404 with HTTPException(detail=...) when missing.

## MIGRATION STRATEGY (shared Postgres, alembic_version is 'scr2_cabinet', file missing)
The shared Postgres `alembic current` = scr2_cabinet, but no migration file for it exists anywhere accessible. To apply your new `blueprints` migration on the shared DB you must make the alembic graph resolve from that state:
- Create a NO-OP stub migration file in backend/migrations/versions/ named e.g. `scr2_cabinet_missing_stub.py` with revision='scr2_cabinet', down_revision=<the revision that scr2_cabinet logically extends — if unknown set it to 'perf1_indexes' is WRONG; instead pick a safe prior real revision>, and upgrade()/downgrade() = pass. The DB is ALREADY at scr2_cabinet so this stub never re-executes; it only satisfies alembic's graph.
  - IMPORTANT: to know the correct down_revision, inspect the scr-chain worktree branches if reachable; if not reachable, set the stub's down_revision to the real last-applied revision that you can confirm on the DB, OR simply make the stub the graph head that scrubben. If alembic upgrade then fails on ordering, use `alembic stamp scr2_cabinet` to mark the stub applied and then upgrade your blueprint migration on top. Empirically resolve with these commands, in this order, using the primary venv binary from the worktree backend dir:
      /home/aifactory/PartsDonor/backend/.venv/bin/alembic heads
      /home/aifactory/PartsDonor/backend/.venv/bin/alembic current
      /home/aifactory/PartsDonor/backend/.venv/bin/alembic upgrade head
- Then create the real migration `blueprints` in backend/migrations/versions/, with down_revision pointing at whatever head your stub produced (e.g. 'scr2_cabinet'), upgrade() creates table `blueprints` via op.create_table with the columns above (id UUID pk default gen_random_uuid() or uuid — check how other migrations/table definitions create uuid defaults in this repo; for Postgres prefer sa.Uuid() / server_default=sa.text("gen_random_uuid()") if pgcrypto is in use, else use sa.Text/uuid fine with sa.Uuid). Make the CREATE idempotent-style isn't required but guard against double-create if feasible (op.get_bind() inspect).
- Verify the migration actually applied on the shared Postgres and the `blueprints` table exists (query information_schema).
- Do NOT touch / break the pre-existing migration fork (caf5db912fa8 be2 fork) — just chain around it as needed.
- NOTE: Do NOT run `alembic upgrade head` if it would error on 'Multiple head revisions' — target the explicit blueprint revision: `/home/aifactory/PartsDonor/backend/.venv/bin/alembic upgrade <blueprint_rev>`.

## FRONTEND WORK
1. frontend/src/pages/BlueprintEditor.jsx — extend the existing BLD-1/BLD-2 editor:
   - Replace the two free-text brand/model inputs (currently `<input placeholder="Apple">` and `<input placeholder="iPhone X">` in the save form) with a BRAND dropdown + MODEL dropdown (and/or a combined select) sourced from the catalog. The catalog model list: GET /api/catalog returns array of CatalogItem; derive the unique brand list and per-brand model list from it. (See DonorWizard.jsx lines ~452-464 for an existing grouped brand->model <select> pattern, and Catalog.jsx slugify.) Keep a sensible fallback: if /api/catalog is empty/fails, keep manual text input as fallback so save still works.
   - Add route support for /editor/:brand/:model: when the URL provides brand+model, pre-fill them AND try to load the existing blueprint via GET /api/blueprints/{brand}/{model} (normalized match). If found, hydrate the canvas (figures from bp.parts; svg from bp.svg) exactly like the existing loadSaved() does (parses data-figures from svg, or better read bp.parts directly since parts is now a first-class JSON array). If 404 (not found), start blank with brand/model prefilled.
   - Change SAVE to POST/PUT /api/blueprints: if the URL carried brand+model and a blueprint with that key already exists (has an id), send PUT /api/blueprints/{id} to UPDATE it (this is the 'редактирование существующих' requirement); otherwise POST /api/blueprints to create. The POST/PUT body: { brand, model, svg: buildSvg(figures), parts: figures }. Keep the existing buildSvg/buildHotspots helpers.
   - Keep the existing 'Загрузить' load-saved-schemas list working (it currently lists device-schemas; either keep it on /device-schemas or switch the list to /api/blueprints — your call, but do not break the view/detail-draw flow). Simpler: switch savedSchemas list to /api/blueprints.
   - Keep BLD-2 view mode (clickable figures, availability from /api/catalog?q=<key>, detail card) fully intact.
2. frontend/src/App.jsx — add the lazy import + route for the editor WITH param: keep <Route path="/editor" element={<BlueprintEditor/>} /> AND add <Route path="/editor/:brand/:model" element={<BlueprintEditor/>} />. BlueprintEditor should read params via useParams().
3. DonorView.jsx (/donor/:brand/:model) — if a custom blueprint exists for the model, use/show it: in the existing useEffect that fetches /api/device-schemas and matches brand+model, ALSO fetch GET /api/blueprints/{brand}/{model} (normalized). If one exists, surface a link/button to the editor (e.g. 'Открыть схему в конструкторе' -> /editor/:brand/:model) and/or show that blueprint's svg/parts instead of the exploded view. Keep the existing donor exploded view working when NO custom blueprint (do not break the normal /donor page). At minimum: detect existence and render an edit link; showing the custom svg/parts is a plus. Do NOT break the BLD-2 donor availability logic.
4. Styles: append any new editor/dropdown/editor-link CSS to frontend/src/styles.css under a clear /* ---- BLD-3: ... ---- */ comment. Use :root tokens and .btn/.pd-* classes. Adaptive (mobile stacks). Do not break existing styles.

## ACCEPTANCE (all must be real and verified)
- Blueprint saved with brand+model binding (POST /api/blueprints persists; row in blueprints table).
- Loading an existing scheme by brand+model into the editor works (GET /api/blueprints/{brand}/{model} -> canvas hydrated).
- Editing persists via PUT /api/blueprints/{id} (figures changed -> updated_at bumped, parts/svg updated).
- Brand+model dropdown sourced from catalog.
- Existing /donor logic not broken.
- /editor/:brand/:model and /editor both work as routes.

## VERIFY (do all; real evidence only, no fabricated output)
- Backend: start your own uvicorn from THIS worktree against the shared Postgres on a fresh port (never 8001, and pick one that's free, e.g. 8031). Wait for /health 200. Then curl:
    * POST /blueprints with sample body -> 201 + id
    * GET /blueprints/{brand}/{model} -> returns it
    * PUT /blueprints/{id} with changed parts -> 200 + updated_at changed
    * GET /blueprints -> list contains it
  Capture real curl status codes + bodies.
- Confirm `blueprints` table exists in Postgres (query information_schema) and row count after your test.
- Frontend build: `cd frontend && npm run build` must exit 0 (run via the venv-independent node; node/npm are in PATH).
- Browser: write a Playwright node script (e.g. frontend/bld3_verify.cjs, run with `node`, NOT pytest) against the dev server. Start the dev server on a FRESH port with BE_PORT pointing at YOUR backend port: `BE_PORT=<yourbe> node_modules/.bin/vite --port <fresh, e.g. 5183> --strictPort` (NOT npx). Verify:
    * /editor renders the SVG canvas and the brand/model dropdowns populated from /api/catalog
    * draw a rect + circle, save -> POST /api/blueprints 2xx and the brand/model appear (verify row in DB)
    * /editor/:brand/:model (use a brand/model you saved) loads the existing figures back onto the canvas
    * edit a figure (move it) + save -> PUT /api/blueprints/{id} 2xx (verify updated row)
    * /donor/:brand/:model still renders (not broken)
  The security guard blocks any foreground command printing the literal word `vite` and blocks `python3 -c`; write scripts with write_file and run them, and redirect dev-server startup output to a log file (`cmd > /tmp/x.log 2>&1 &`) so 'vite' never appears inline. Playwright scripts: write with write_file, run with `node script.cjs`. To hover/click SVG elements use page.mouse.move to real pixel centers (mouseenter dispatch does NOT fire React handlers).

## WORKING RULES
- COMMIT EARLY AND OFTEN on branch wt/t_736f258b (git add -A && git commit). The worktree can be pruned mid-run; committed work survives in the shared object store.
- The frontend/node_modules symlink is ALREADY UNTRACKED and .gitignore now covers `frontend/node_modules` (added this session). Do NOT `git add frontend/node_modules`. Leave it on disk as a dev aid; it must not appear in any commit.
- Do NOT do BLD-4 presets. Do NOT break existing pages/routes/device-schemas. Do NOT touch InvenTree directly.
- Keep the BLD-1 verify script (bld1_verify.cjs) and BLD-2 (bld2_verify.cjs) working if possible; add a new bld3_verify.cjs.

## REPORT / FINAL STATE
Report: every file created/modified, the endpoints, migration files + how you made alembic resolve to apply them, and the verification evidence (real curl status codes, DB row confirmations, npm build exit code, playwright assertions). Then, AFTER all edits and verification are done and the node_modules symlink is untracked, commit with a clear message e.g. 'feat(blueprints): BLD-3 — bind scheme to brand+model, /blueprints REST, editor dropdown + PUT edit, donor link' and `git log --oneline -3`. Print git status + the final log.
