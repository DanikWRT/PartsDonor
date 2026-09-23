"""B7: probe current reviews/companies schema + data state."""
import asyncio
import asyncpg

URL = "postgresql://pduser:pdpass@localhost:5433/partsdonor"

async def main():
    c = await asyncpg.connect(URL)
    # reviews table?
    has = await c.fetchval(
        "select count(*) from information_schema.tables where table_name='reviews'"
    )
    print("reviews table exists:", bool(has))
    if has:
        cols = await c.fetch(
            "select column_name, data_type, is_nullable from information_schema.columns "
            "where table_name='reviews' order by ordinal_position"
        )
        print("reviews columns:")
        for x in cols:
            print("  ", x["column_name"], x["data_type"], x["is_nullable"])
        print("reviews rows:", await c.fetchval("select count(*) from reviews"))
    # companies
    ccols = await c.fetch(
        "select column_name from information_schema.columns where table_name='companies' order by ordinal_position"
    )
    print("companies columns:", [x["column_name"] for x in ccols])
    comps = await c.fetch("select id, name, role, rating from companies order by created_at desc limit 10")
    print("companies (id,name,role,rating):")
    for r in comps:
        print("  ", r["id"], r["name"], r["role"], r["rating"])
    await c.close()

asyncio.run(main())
