"""Inspect current PartsDonor DB state (dev check)."""
import asyncio
from collections import defaultdict

import asyncpg

TABLES = ["companies", "device_schemas", "listings", "deals", "reviews"]


async def main():
    c = await asyncpg.connect("postgresql://pduser:pdpass@localhost:5433/partsdonor")
    for t in TABLES:
        try:
            n = await c.fetchval(f"select count(*) from {t}")
            print(f"{t}: {n}")
        except Exception as e:  # noqa: BLE001
            print(f"{t}: ERR {e!r}")
    cols = await c.fetch(
        "select table_name, column_name from information_schema.columns "
        "where table_schema='public' order by table_name, ordinal_position"
    )
    d = defaultdict(list)
    for r in cols:
        d[r["table_name"]].append(r["column_name"])
    print("--- columns ---")
    for t in sorted(d):
        print(t, d[t])
    await c.close()


asyncio.run(main())
