"""Set exploded_view_url for Apple/iPhone 13 Pro to the local real photo.

Run with the backend venv python so asyncpg is available.
"""
import asyncio
import asyncpg

DSN = "postgresql://pduser:pdpass@127.0.0.1:5433/partsdonor"
NEW_URL = "/exploded-view.jpg"  # served by the frontend dev server from frontend/public/


async def main() -> None:
    conn = await asyncpg.connect(DSN)
    try:
        cols = await conn.fetch(
            "SELECT column_name FROM information_schema.columns WHERE table_name='device_schemas' ORDER BY ordinal_position"
        )
        print("columns:", [r["column_name"] for r in cols])
        before = await conn.fetch(
            "SELECT id, brand, model, exploded_view_url FROM device_schemas WHERE brand='Apple' AND model='iPhone 13 Pro'"
        )
        for r in before:
            print("BEFORE:", r["id"], r["brand"], r["model"], "->", r["exploded_view_url"])
        res = await conn.execute(
            "UPDATE device_schemas SET exploded_view_url=$1 WHERE brand=$2 AND model=$3",
            NEW_URL, "Apple", "iPhone 13 Pro",
        )
        print("UPDATE:", res)
        after = await conn.fetch(
            "SELECT id, brand, model, exploded_view_url FROM device_schemas WHERE brand='Apple' AND model='iPhone 13 Pro'"
        )
        for r in after:
            print("AFTER:", r["id"], r["brand"], r["model"], "->", r["exploded_view_url"])
    finally:
        await conn.close()


asyncio.run(main())
