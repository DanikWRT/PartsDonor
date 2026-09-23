"""Проверка состояния БД partsdonor: таблицы + alembic_version."""
import asyncio

import asyncpg


async def main() -> None:
    c = await asyncpg.connect("postgresql://pduser:pdpass@localhost:5433/partsdonor")
    rows = await c.fetch("select tablename from pg_tables where schemaname='public' order by 1")
    print([r[0] for r in rows])
    try:
        v = await c.fetch("select version_num from alembic_version")
        print("alembic_version:", [r[0] for r in v])
    except Exception as exc:
        print("alembic_version: none", exc)
    await c.close()


asyncio.run(main())
