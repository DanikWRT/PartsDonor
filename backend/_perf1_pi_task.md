You are implementing PERF-1 for the PartsDonor marketplace backend: "индексы + eager-loading (убрать N+1)".

HARD CONSTRAINT: use ONLY SQLAlchemy models + alembic. Do NOT touch the frontend (no frontend changes needed; just confirm `npm run build` still passes at the end).

== REPO / ENV FACTS (already verified; trust these) ==
- Worktree (cwd): /home/aifactory/PartsDonor/.worktrees/t_e9a28072   (branch wt/t_e9a28072)
- Backend code lives in backend/ under that worktree: backend/app/{main.py,models.py,config.py,db.py,inventree_client.py}
- Python venv (use THESE binaries, the worktree has NO venv): /home/aifactory/PartsDonor/backend/.venv/bin/python and .../alembic and .../uvicorn
- DB: PostgreSQL partsdonor, URL default in config.py = postgresql+asyncpg://pduser:pdpass@localhost:5433/partsdonor (settings.database_url; alembic env reads app.config settings).
- The backend/.env exists ONLY in the primary tree, NOT in the worktree. To run scripts/alembic from the worktree backend dir, the default URL already targets localhost:5433/partsdonor so no env needed.
- Models file: backend/app/models.py. List endpoints live in backend/app/main.py (single file, huge ~3200 lines).
- InvenTree is an EXTERNAL HTTP source (async client). `_part_info(part_id)` in main.py does an N+1 HTTP call per listing to get part name/category.

== DB INDEX STATE (verified live; do NOT trust the worktree schema files, trust THIS) ==
Already present on the shared DB (created by earlier cards / misc names):
  listings: ix_listings_seller_id, ix_listings_status
  deals:    ix_deal_status            (=== this is deals.status index already)
  donor_lots: ix_donor_lots_status
  messages: ix_messages_author_id, ix_messages_dialog_id_created (dialog_id covered)
  kb_articles: ix_kb_articles_cat, ix_kb_articles_author_id
  reviews:  ix_reviews_seller_id
MISSING and REQUIRED by the task (this is the ONLY genuinely missing index):
  listings.inventree_part_id  -> create index ix_listings_inventree_part_id on listings(inventree_part_id)

So: all task-required indexes already exist EXCEPT listings.inventree_part_id.

== DELIVERABLES ==
1. MODELS: in backend/app/models.py add index=True (or add to __table_args__ Index) on Listing.inventree_part_id so the ORM schema reflects the index. Name it ix_listings_inventree_part_id. Do not introduce duplicates for indexes that already exist.

2. EAGER LOADING in backend/app/main.py — remove N+1 in list endpoints. Concretely:
   a) list_listings (around line 906-920): currently `records = await db.execute(stmt).scalars().all()` then loops calling `_part_info(record.inventree_part_id)` (N+1 HTTP).
      - Add .options(selectinload(Listing.seller)) to load seller/company with the listings (1+1).
      - Batch the InvenTree part lookups: collect unique inventree_part_ids from the fetched records, fetch them in ONE asyncio.gather (or one batched call), build a {part_id: (name, category)} map, assign to each record's .part_name/.part_category. Keep the same behavior when a part fetch fails (fall back to (None,None)).
   b) list_deals (around line 1051-1059): add .options(selectinload(Deal.buyer), selectinload(Deal.seller)) so buyer/seller companies are eager-loaded (currently not loaded at all -> one query per deal when the serializer touches them, or MissingGreenlet risk in async).
   c) list_donor_lots (around line 502-559): currently inside the per-record loop it runs `select(Listing).where(Listing.donor_lot_id == lot.id)` — that is an N+1 DB query. Replace with ONE batched query: after fetching all lots, run a single select(Listing).where(Listing.donor_lot_id.in_([...ids])) and build a {donor_lot_id: listing_id} map.
   d) Audit other list endpoints you touch and keep them consistent; do not regress existing selectinload usage.
   Preserve exact response shapes. Keep using selectinload (import already present at top: `from sqlalchemy.orm import selectinload`). Leave the CHAT dialog-list (already uses selectinload) and other already-good endpoints alone.

3. NEW ALEMBIC MIGRATION: create backend/migrations/versions/perf1_indexes.py
   - revision: 'perf1_indexes', down_revision: 'be6_storefront_perf' (the real head in this worktree).
   - upgrade(): idempotently create ONLY ix_listings_inventree_part_id on listings(inventree_part_id) if not present. Use an inspect(op.get_bind()).get_indexes("listings") guard (like the existing be6 migration pattern) so it never DuplicateTableErrors on the shared DB.
   - downgrade(): drop it only if present.
   - IMPORTANT pitfall: the shared DB's alembic_version is stamped 'scr2_cabinet' (a foreign revision not in this worktree), and the migration graph has a known pre-existing stub fork (caf5db912fa8_be2_stub) causing 'Multiple head revisions'. Do NOT try to fix that fork. To APPLY your new migration to the shared DB safely, run it explicitly and never on 'head': 
       /home/aifactory/PartsDonor/backend/.venv/bin/alembic upgrade perf1_indexes
     If alembic refuses (Can't locate revision be6_storefront_perf on the stored graph) because the DB's stored version is scr2_cabinet, then instead apply the index with a small guarded python script (connect via app.db engine, CREATE INDEX IF NOT EXISTS ix_listings_inventree_part_id ON listings (inventree_part_id);). The migration FILE must still exist and be correct for the repo; whether alembic stamps it on the shared DB is secondary — the INDEX must exist on the shared DB and the file must be committed. Prefer making alembic apply it; fall back to the script if the shared-DB graph blocks it. Record which path you took.

4. VERIFY end-to-end (write small scripts in backend/, run with the venv python; do not rely on mental claims):
   a) Index exists: run a probe (like: SELECT indexname FROM pg_indexes WHERE tablename='listings') and show ix_listings_inventree_part_id present.
   b) N+1 gone: start the backend on a fresh unused port (e.g. 8025) with the venv uvicorn below, then e2e-curl /listings, /deals, /donor-lots and confirm 200 + expected JSON shape. To PROVE no DB N+1, enable echo or count queries: set a session-level approach — simplest reliable proof: a small async probe script that runs the same list query with selectinload and inspects that seller/deal-party relationships are loaded without triggering lazy loads. Confirm seller name / buyer / seller fields populate in the JSON responses (previously they were not eager-loaded).
   c) Confirm the response shapes didn't regress vs the Pydantic schemas (listings/part_name+part_category still present; deals have buyer/seller; donor-lots have seller_name/seller_rating/seller_verified/listing_id).
   d) Confirm no 500 / no MissingGreenlet errors in the logs.
   e) Frontend: from the repo root run `npm run build` (or in frontend/ `npm --prefix frontend run build` — check where package.json is) and confirm exit 0. You may need to do this in frontend/ dir.

5. COMMIT EARLY AND OFTEN on branch wt/t_e9a28072 (worktrees can be pruned mid-run and uncommitted files are lost). Commit at least after each milestone: models+main.py edits, migration, verification. Use clear commit messages.

== HOW TO RUN ==
- Everything with the venv: /home/aifactory/PartsDonor/backend/.venv/bin/python <script> ; alembic: /home/aifactory/PartsDonor/backend/.venv/bin/alembic ... (run from the worktree backend/ dir so it picks up backend/alembic.ini + migrations/ — the .env absence is fine, default URL already correct).
- Start server: cd backend && /home/aifactory/PartsDonor/backend/.venv/bin/uvicorn app.main:app --port 8025 (background), then curl http://127.0.0.1:8025/listings etc. NOTE: the router has NO prefix — endpoints are at ROOT path (/listings, /deals, /donor-lots, /dialogs), NOT /api/* (the frontend strips /api via its Vite proxy; you curl the backend directly so use root paths).
- DB is shared: do not assert exact global row counts; assert presence/shape of expected records.

== REPORT BACK ==
Report: which files you changed (paths), the diff summary for main.py eager-loading changes, the migration filename+revision, the exact proof that ix_listings_inventree_part_id exists on the shared DB, the e2e-curl results (endpoint -> status -> whether relationships populated without N+1), whether you started uvicorn on 8025 and its proof, npm build exit code, and the list of commits you made (hashes). Include the full absolute paths of any verification scripts/artifacts you wrote on disk.

Do the work for real with tools (edit files, run the venv python, run alembic, run the server, curl it). Do NOT just describe a plan.
