# I1 integration fix B: buyer company binding (make full buyer E2E work)

Repo: /home/aifactory/PartsDonor. Backend FastAPI on 8001, frontend Vite React.
Already done: authFetch() attaches JWT to protected write calls, Cabinet deal-status
endpoint fixed to POST /deals/{id}/transition.

## Remaining problem
A logged-in BUYER has no Company: backend/auth.py register() only creates a Company for
role=seller; buyer users get company_id=None. The buyer UI (BuyerCabinet.jsx) picks
companies.find(c=>c.role==='buyer') (first buyer company) as its `buyer` for deal creation,
and login TokenOut has no company_id, so the frontend can't know the buyer's own company.
Result: a buyer can create a deal (POST /deals is public) but CANNOT advance it
(POST /deals/{id}/transition and /pay require ownership where user.company_id must equal
the deal's buyer_company_id; buyer company_id is None -> 403).

## Goal
Give a registered buyer its own Company (like a seller), surface company_id to the
frontend, and make BuyerCabinet use the logged-in buyer's company_id. Sellers already work
(server binds seller_id from JWT company_id - do NOT regress that).

## Changes

### 1. backend/app/auth.py
- In `register()`: currently only `role==UserRole.seller` creates a Company. Extend so
  `role==UserRole.buyer` ALSO creates a Company(role="buyer") and binds user.company_id to
  it. Use the same slug-uniqueness pattern as the seller branch. Keep admin forbidden.
  Do NOT reuse or collide with seller names - buyer company name can be
  `payload.company_name or email-prefix` if provided, else email prefix (mirror seller).
- `TokenOut` (login response): add `company_id: uuid.UUID | None = None` and populate it in
  `login()` from the found user (`user.company_id`).
- Keep `UserOut` company_id as is (already present) - register already returns it.

### 2. frontend/src/auth.jsx
- In `storeSession(data)`: also persist `company_id: data.company_id` into the pd-session
  object (and read via readSession). No breakage for old sessions (undefined ok).

### 3. frontend/src/pages/BuyerCabinet.jsx
- Import { readSession } (and authFetch already there).
- Determine `buyer` company: prefer the logged-in session's company_id
  (`readSession().company_id`), mapped to the companies list; FALL BACK to the legacy
  `companies.find(c=>c.role==='buyer')` only if session company_id missing/unknown.
- `checkout` still POSTs /api/deals via authFetch with `buyer_company_id: buyer.id`.
  (With session present, buyer.id is now the logged-in buyer's own company.)
- Keep the rest unchanged.

## Constraints
- Do NOT touch seller paths or authenticated seller behavior.
- Do NOT change GET reads.
- Preserve existing UX.
- Backend restart needed after edit to auth.py. Frontend hot-reloads.

## Verify
- `cd frontend && npm run build` must exit 0.
- Restart backend: `cd backend && pkill -f uvicorn app.main:app || true; nohup
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001 >> /tmp/pd_backend.log 2>&1 &
  sleep 3; curl -s http://127.0.0.1:8001/health`
  (IMPORTANT: preserve PARTSDONOR_YOOKASSA_NOTIFICATION_SECRET if it was set; check the
  previous backend process command via `ps aux | grep uvicorn`. Copy its env via reading
  /proc/<oldpid>/environ is overkill - instead just re-run the same env vars from the skill:
  export PARTSDONOR_YOOKASSA_NOTIFICATION_SECRET so I2 webhook stays valid. If unsure,
  leave the backend running and tell me to restart it manually instead.)
- Print final diff summary.
