import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect("postgresql://pduser:pdpass@localhost:5433/partsdonor")
    rows = await conn.fetch("select typname from pg_type where typtype='e'")
    print([r["typname"] for r in rows])
    await conn.close()

asyncio.run(main())
