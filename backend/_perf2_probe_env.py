import asyncio, os, sys

VENV = "/home/aifactory/PartsDonor/backend/.venv/bin/python"

async def main():
    # 1. DB reachability
    _raw = os.environ.get("PARTSDONOR_DATABASE_URL", "postgresql://pduser:pdpass@127.0.0.1:5433/partsdonor")
    url = _raw.replace("+asyncpg", "")
    try:
        import asyncpg
        conn = await asyncpg.connect(url)
        row = await conn.fetchrow("SELECT count(*) AS n FROM pg_tables WHERE schemaname='public'")
        tables = await conn.fetchval("SELECT count(*) FROM pg_tables WHERE schemaname='public'")
        print(f"DB CONNECT: ok, {tables} public tables")
        idx = await conn.fetchval("""SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='ix_listings_inventree_part_id'""")
        print(f"perf1 index ix_listings_inventree_part_id present: {idx>0}")
        await conn.close()
    except Exception as e:
        print(f"DB CONNECT: FAIL {type(e).__name__}: {e}")

asyncio.run(main())
