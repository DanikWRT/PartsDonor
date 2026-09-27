You are implementing PERF-2 for the PartsDonor marketplace backend: "пагинация + кэш InvenTree (<1с)". This is purely BACKEND + verification work. The frontend must be UNTOUCHED (just confirm `npm run build` still passes).

HARD CONSTRAINT: modify ONLY backend/. Use SQLAlchemy + the existing InvenTree client. Do NOT touch frontend/ code. No DB schema migration is needed (pagination = query params only); do NOT create an alembic migration.

== REPO / ENV FACTS (already verified; trust these) ==
- Worktree (cwd): /home/aifactory/PartsDonor/.worktrees/t_5a85885c   (branch wt/t_5a85885c)
- Backend code: backend/app/{main.py,models.py,config.py,db.py,inventree_client.py} (main.py is ONE huge file ~3250 lines).
- Python venv (the worktree has NO venv, use THESE binaries): /home/aifactory/PartsDonor/backend/.venv/bin/{python,uvicorn,alembic}
- DB: PostgreSQL partsdonor at postgresql://pduser:pdpass@127.0.0.1:5433/partsdonor (settings.database_url default; 23 tables, live/reachable). No backend/.env in this worktree; the default URL is fine.
- InvenTree is an EXTERNAL HTTP source (async) and is UNREACHABLE in this env (blank token) -> all InvenTree reads return empty. That is fine and PRE-EXISTING; the goal (20 parallel /catalog median <1s) must be met even with empty InvenTree data.
- InvenTree client already has a short-TTL in-process cache + single-flight (_TTLCache in inventree_client.py, TTL = settings.inventree_cache_ttl_seconds = 10.0). get_part/search_parts/list_categories/list_stock are cached. This satisfies the "кэш горячих чтений InvenTree" requirement — you verify it, do NOT rip it out. If you find a real gap (e.g. a hot read NOT cached or a serial-await hotspot) you may improve it, but keep semantics.

== TASK ==
Add limit/offset pagination to all list-GET endpoints that lack it, and verify the InvenTree cache + a 20-parallel /catalog latency goal.

### 1. /catalog pagination (PRIMARY — the perf target)
File: backend/app/main.py, `@router.get("/catalog", response_model=list[CatalogItem])` (around line 252, uses `async def catalog(...)`). Add:
- `limit: int = Query(default=50, ge=1, le=200)`
- `offset: int = Query(default=0, ge=0)`
After the existing filter loop builds `items` and applies sort (price_asc/price_desc/name), apply `items = items[offset : offset + limit]` (i.e. paginate AFTER filtering+sorting, so filters stay correct). Keep the InvenTree fetches cached/single-flight as-is. This bounds the response body AND the per-request work to the warm-cache path.

### 2. Paginate the other list endpoints that LACK limit/offset (add the same two Query params, apply .offset(offset).limit(limit) on the DB stmt before execute, order preserved):
- GET /donor-lots (`list_donor_lots`, ~line 502)
- GET /listings (`list_listings`, ~line 906)
- GET /deals (`list_deals`, ~line 1051)
- GET /notifications (`list_notifications`, ~line 1343)  [careful: it has a user Depends of roles]
- GET /reviews (`list_reviews`, ~line 1667)
- GET /donors (`list_my_donors`, ~line 1747)
- GET /master/profiles (`list_master_profiles`, ~line 1630)
- GET /buy-requests/me (`my_buy_requests`, ~line 2216)
Do NOT touch endpoints that ALREADY have limit/offset (i.e. /buy-requests 1998, /kb/articles 2372, /kb/authors/top 2494, /dialogs 2767, /dialogs/{id}/messages 2998, /offers 3203) — verify only. Keep default limit <=200, ge=1, le<=500.

### 3. InvenTree cache verification (no code change unless you find a gap)
Write a probe script that imports inventree_client and asserts: (a) _TTLCache caches a repeated read (2nd call hits in-memory, no network), (b) single-flight coalesces two concurrent same-key calls into one factory invocation. Use the venv python, run as `python <file>.py` (NOT -c, NOT pytest; single-query shell blocks those). Also print settings.inventree_cache_ttl_seconds.

### 4. Verification (run it, prove it)
- Start the backend on a FRESH port (check `ps aux | grep uvicorn` first; many stale servers hold reused ports — pick e.g. 8027 unless taken):
  `cd backend && PARTSDONOR_DATABASE_URL='postgresql+asyncpg://pduser:pdpass@127.0.0.1:5433/partsdonor' /home/aifactory/PartsDonor/backend/.venv/bin/python -m uvicorn app.main:app --port 8027 --host 127.0.0.1` (background). Wait for /health 200.
- e2e-curl: GET /catalog?limit=5&offset=0 -> exactly <=5 items, 200; /catalog?limit=5&offset=5; /catalog?limit=200; /listings?limit=3; /deals?limit=3; /donor-lots?limit=3; /reviews?limit=3; /notifications?limit=3; /donors?limit=3; /master/profiles?limit=3; /buy-requests/me?limit=3. Assert 200 and that row counts never exceed the requested limit.
- Concurrency probe: fire 20 PARALLEL GET /catalog requests (asyncio/aiohttp or httpx in one python script) and measure median latency. Expect median well under 1s (empty InvenTree -> fast). Print min/p50/p95. Save the script; keep the first-run numbers.
- Frontend: `cd frontend && npm run build` must exit 0 (confirm no regression; do not modify frontend files).
- Commit ALL work on the current branch (wt/t_5a85885c) in staged commits with short messages (commit early and often).

== OUTPUT ==
Write the verification scripts under backend/ named `_perf2_*.py` / `_perf2_*.sh`. Report final output as a short summary: which endpoints got limit/offset, the median/pkg latency numbers from the 20-parallel probe, e2e-curl result, npm build result, and commit hashes. Do NOT paste huge code into the final message.
