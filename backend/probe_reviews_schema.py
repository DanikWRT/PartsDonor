"""Dump current columns/rows of reviews & deals tables (schema-check)."""
import asyncio
import asyncpg


async def main():
    c = await asyncpg.connect("postgresql://pduser:pdpass@localhost:5433/partsdonor")
    cols = await c.fetch(
        "select column_name, data_type, is_nullable "
        "from information_schema.columns where table_name='reviews' order by ordinal_position"
    )
    print("reviews columns:")
    for x in cols:
        print("  ", x["column_name"], x["data_type"], x["is_nullable"])
    print("reviews rows:", await c.fetchval("select count(*) from reviews"))
    print("deals rows:", await c.fetchval("select count(*) from deals"))
    de = await c.fetch("select id from deals limit 5")
    print("deal ids:", [str(r["id"]) for r in de])
    await c.close()


asyncio.run(main())
