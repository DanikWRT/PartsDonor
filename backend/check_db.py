"""Check Postgres connectivity (our market DB on 5433)."""
import asyncio
import asyncpg


async def main():
    dsn = "postgresql://pduser:pdpass@localhost:5433/partsdonor"
    try:
        conn = await asyncpg.connect(dsn)
        ver = await conn.fetchval("select version()")
        print("connected:", ver.split(',')[0])
        tables = await conn.fetch(
            "select tablename from pg_tables where schemaname='public' order by tablename")
        print("tables:", [r['tablename'] for r in tables])
        await conn.close()
    except Exception as e:
        print(f"DB connect FAILED: {e!r}")


asyncio.run(main())
