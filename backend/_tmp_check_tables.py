import asyncio
import asyncpg


async def main():
    c = await asyncpg.connect('postgresql://pduser:pdpass@localhost:5433/partsdonor')
    v = await c.fetchval('select version_num from alembic_version')
    print('alembic_version:', v)
    t = await c.fetch("select typname from pg_type where typtype='e'")
    print([r['typname'] for r in t])
    await c.close()


asyncio.run(main())
