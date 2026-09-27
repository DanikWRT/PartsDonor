'''PERF-1 fallback: apply listings.inventree_part_id index to the shared DB directly.

Used only because the shared DB's alembic_version is stamped 'scr2_cabinet'
(a foreign revision not in this worktree) and the local graph has a pre-existing
stub fork, so 'alembic upgrade perf1_indexes' cannot be located on the shared graph.
The migration FILE (perf1_indexes.py) is still correct & committed for the repo.

Run: /home/aifactory/PartsDonor/backend/.venv/bin/python _perf1_apply_index.py (cwd: backend/)
'''
import asyncio
from sqlalchemy import text
from app.db import engine as async_engine

CREATE = "CREATE INDEX IF NOT EXISTS ix_listings_inventree_part_id ON listings (inventree_part_id)"

async def main():
    async with async_engine.begin() as conn:
        await conn.execute(text(CREATE))
        await conn.commit()
    # verify
    async with async_engine.connect() as conn:
        r = await conn.execute(text(
            "SELECT indexname FROM pg_indexes WHERE tablename='listings' AND indexname='ix_listings_inventree_part_id'"
        ))
        print("index present:", r.scalar_one_or_none())
    await async_engine.dispose()

asyncio.run(main())
