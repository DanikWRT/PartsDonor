import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect("postgresql://pduser:pdpass@localhost:5433/partsdonor")
    rows = await conn.fetch("select tablename from pg_tables where schemaname='public'")
    print([r["tablename"] for r in rows])
    await conn.close()

asyncio.run(main())
