"""Проверка состояния БД partsdonor (таблицы + alembic-версия)."""

import asyncio

import asyncpg


async def main() -> None:
    c = await asyncpg.connect(
        host="127.0.0.1", port=5433, user="pduser", password="pdpass", database="partsdonor"
    )
    rows = await c.fetch("select tablename from pg_tables where schemaname='public' order by 1")
    print("tables:", [r["tablename"] for r in rows])
    try:
        v = await c.fetchval("select version_num from alembic_version")
        print("alembic_version:", v)
    except Exception as exc:  # noqa: BLE001
        print("alembic_version: none", exc)
    for t in ("companies", "device_schemas", "listings", "deals", "reviews"):
        try:
            n = await c.fetchval(f"select count(*) from {t}")
            print(f"{t}: {n} rows")
        except Exception as exc:  # noqa: BLE001
            print(f"{t}: ERR {exc}")
    await c.close()


asyncio.run(main())
