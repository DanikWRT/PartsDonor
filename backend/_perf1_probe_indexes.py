"""PERF-1 probe: dump current indexes on target tables + alembic_version.

Run: /home/aifactory/PartsDonor/backend/.venv/bin/python _perf1_probe_indexes.py   (cwd: backend/)
Uses settings.database_url from app.config (reads .env in cwd if present,
else default localhost:5433/partsdonor).
"""
import asyncio
from sqlalchemy import text
from app.db import engine as async_engine

async def main():
    async with async_engine.connect() as conn:
        r = await conn.execute(text("SELECT tablename, indexname FROM pg_indexes WHERE tablename IN ('listings','deals','donor_lots','messages','kb_articles','donor_requests','reviews') ORDER BY tablename, indexname"))
        rows = r.fetchall()
        print("=== indexes ===")
        for t, i in rows:
            print(f"{t:20s} {i}")
        r2 = await conn.execute(text("SELECT version_num FROM alembic_version"))
        print("=== alembic_version ===", r2.scalar_one_or_none())
    await async_engine.dispose()

asyncio.run(main())
