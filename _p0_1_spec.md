# PartsDonor P0-1: AsyncClient / async в inventree_client (не блокировать event-loop)

Repo: /home/aifactory/PartsDonor  (branch master, git repo)
Venv: /home/aifactory/PartsDonor/backend/.venv  (python 3.13, httpx 0.28.1 already installed)

## Problem
`backend/app/inventree_client.py` uses the SYNCHRONOUS `httpx.request()` / `httpx.get()`
inside a FastAPI app whose route handlers are all `async def`. The blocking HTTP calls
block the asyncio event loop, hurting concurrency (esp. the 20s timeout on InvenTree
calls stalls the whole worker).

## Required change
Convert `InventreeClient` to a fully ASYNC client backed by `httpx.AsyncClient`:

1. **inventree_client.py**
   - Replace module-level sync usage with an `httpx.AsyncClient`.
   - The client must be created LAZILY and REUSED across calls (create the
     `httpx.AsyncClient` once and keep it; do NOT create a new client per request, and
     do NOT use `async with` per request which is wasteful). Recommended pattern:
       - give InventreeClient an internal `self._client: httpx.AsyncClient | None = None`
       - an `async def _client(self) -> httpx.AsyncClient` that creates it on first use
         (protect against double-create with a simple check; a module-level or
         first-request creation is fine).
     The reason for lazy creation: InventreeClient is instantiated at import time
     (module-level `inventree = InventreeClient()`), and creating an AsyncClient at that
     moment can bind to the wrong/no event loop. Lazy creation inside a coroutine avoids
     the "attached to a different loop" problem.
   - Make every method that does I/O `async def` and `await` the AsyncClient call:
     `request`, `health`, `list_categories`, `create_category`, `list_parts`, `get_part`,
     `search_parts`, `create_part`, `update_part`, `list_stock`, `create_stock`,
     `part_is_assembly`, `list_bom_items`, `get_bom_subs`, `get_category`,
     `category_name_map`, `create_bom_item`, `list_companies`, `create_attachment`.
   - `request` and `health` become `async def` and use `await self._client.request(...)`
     / `await self._client.get(...)`. `AsyncClient.request`/`.get` return a `Response`;
     keep the same status handling and `.json()`.
   - Keep the module-level singleton `inventree = InventreeClient()`.

2. **backend/app/main.py**  — every call site that touches `inventree.*` must `await`:
   - `_part_info(...)` currently sync -> make it `async def _part_info(...)` and `await`
     the inner `inventree.get_part` / `inventree.category_name_map` calls.
   - `_resolve_brand_model_parts(...)` is already async -> `await` the
     `inventree.get_bom_subs(donor_id)` call.
   - `health` route -> `await inventree.health()`.
   - `catalog` route -> `await inventree.search_parts(...)`, `await inventree.list_categories()`,
     `await inventree.category_name_map()`, `await inventree.list_stock()`.
   - `catalog_detail` route -> `await inventree.get_part(...)`, `await inventree.category_name_map()`,
     `await inventree.list_stock()`.
   - `get_donor` route -> `await inventree.get_part(...)`, `await inventree.get_bom_subs(...)`.
   - `list_listings`, `create_listing`, `get_listing`, `update_listing` routes call
     `_part_info(...)` -> change to `await _part_info(...)`.
   - `create_listing`: `await inventree.get_part(...)` and the raw
     `await inventree.request("GET", f"stock/{...}/")` call.
   - `on_startup`: `await inventree.health()`.

   IMPORTANT: in `list_listings` / `get_listing` / `update_listing` the records are
   mutated via `record.part_name, record.part_category = await _part_info(...)` kept the
   same, just awaited.

## Constraints / style
- Keep the module docstring and code comments in Russian (matching existing style).
- Do not change URLs, method signatures (only add `async`), timeouts, or behaviour.
- `from __future__ import annotations` is already at top; keep it.
- Do NOT touch anything unrelated (deals, auth, yookassa, models, schemas, db).
- Run after editing so nothing else in the repo is affected.

## Verification (MUST do, and show real output)
1. Syntax/compile check:
   `backend/.venv/bin/python -m py_compile app/inventree_client.py app/main.py`
2. Import check under asyncio (proves AsyncClient creation is lazy + no loop error):
   write a tiny throwaway script `backend/_p01_import_check.py` that does:
     import asyncio
     from app.inventree_client import InventreeClient
     async def main():
         c = InventreeClient()
         # first call should lazily build the AsyncClient and run health()
         print("health:", await c.health())
     asyncio.run(main())
   and run it with `backend/.venv/bin/python backend/_p01_import_check.py`.
   (health() may be False if InvenTree isn't up — that alone is fine, but the script must
   complete WITHOUT an event-loop/loop-attached error. If InvenTree is reachable at
   127.0.0.1:8000 health True is even better.)
3. Delete the throwaway script `backend/_p01_import_check.py` after verifying (leave the
   tree clean of scratch).

## Commit
- `cd /home/aifactory/PartsDonor`
- Only add the two changed files: `backend/app/inventree_client.py`, `backend/app/main.py`
  (do NOT add any scratch files).
- Commit message: `PartsDonor P0-1: inventree_client на AsyncClient (async, не блокирует event-loop)`
- Report the commit hash.

Report back: the diff summary of the two files, the results of the py_compile and the
asyncio run (paste their real stdout), and the final commit hash. Do not paste the entire
files.
