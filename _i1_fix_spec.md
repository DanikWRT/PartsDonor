# I1 Integration fix spec: attach JWT to protected API calls

Repo: /home/aifactory/PartsDonor (frontend/ is a Vite React app, backend FastAPI on 8001).
Frontend proxies /api -> 127.0.0.1:8001 (vite.config). Auth token is stored in localStorage under
'pd-token' (set by frontend/src/auth.jsx storeSession). The Auth flow (F8) works.

## Problem
B8 JWT RBAC added `require_roles(...)` to backend write endpoints. The frontend SPA pages
never attach the JWT. Result: seller/buyer write actions fail with 401 "Not authenticated".
GET endpoints stay public (that's why pages load).

## Goal
Add an `authFetch` helper and route ALL protected write calls through it so they send
`Authorization: Bearer <pd-token>`.

## Changes

### 1. frontend/src/auth.jsx — add helper
Add and export:

  export function authFetch(url, options = {}) {
    const token = localStorage.getItem('pd-token')
    const headers = { ...(options.headers || {}) }
    if (token) headers['Authorization'] = 'Bearer ' + token
    return fetch(url, { ...options, headers })
  }

### 2. frontend/src/pages/Cabinet.jsx
- import { authFetch } from '../auth.jsx' (check current imports).
- patchListing (PATCH /api/listings/{id}): use authFetch.
- submitCreate (POST /api/listings): use authFetch.
- FIX BUG: `patchDeal`/`advanceDeal` currently does `PATCH /api/deals/{id}/status`
  with body {status}. The backend has NO such route. The correct endpoint is
  `POST /api/deals/{id}/transition` with body {to: target} (and optional from_status).
  The response is { from_status, to_status, ok, deal }. Update patchDeal to:
    const r = await authFetch(`/api/deals/${id}/transition`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ to: status }),
    })
  and advanceDeal must setDeals mapping to `updated.deal ?? updated` (response wraps the deal).
  Clean up error handling (r.json() may be {detail}), keeping the existing UX (formMsg).

### 3. frontend/src/pages/BuyerCabinet.jsx
- POST /api/deals (create) and POST /api/deals/{id}/transition must use authFetch.
  (POST /deals is technically public on backend today, but adding the header is harmless
   and future-proof; POST /transition REQUIRES the header.)

### 4. frontend/src/pages/Deal.jsx
- POST /api/deals/{id}/pay (buyer) must use authFetch.
- POST /api/deals/{id}/transition (advanceDeal-like call, line ~493) must use authFetch.
- POST /api/reviews (line ~304) is public on the backend; it's fine with plain fetch
  OR authFetch (prefer authFetch for consistency).

### 5. frontend/src/pages/DonorView.jsx
- PATCH /api/listings/{id} (line ~527, seller status update) must use authFetch.

## Constraints
- Do NOT change GET (read) calls; they are public and must stay plain fetch.
- Do NOT touch Auth.jsx login/register.
- Match existing code style (plain JS const, no TypeScript).
- Preserve all existing UI/logic/UX. Only change how the network call is made (+ the one
  endpoint/target fix in Cabinet patchDeal).

## Verify
- `cd frontend && npm run build` must exit 0.
- Do not restart the backend. Frontend dev server (5173) hot-reloads; if needed rebuild.
- Print the final diff summary (files changed + line counts) at the end.
