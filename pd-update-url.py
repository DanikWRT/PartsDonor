#!/usr/bin/env python3
"""Set exploded_view_url to the locally-served real photo for the Apple/iPhone 13 Pro device schema."""
import asyncio
import asyncpg

DSN = "postgresql://pduser:pdpass@127.0.0.1:5433/partsdonor"
NEW_URL = "/exploded-view.jpg"  # served by the frontend dev server from frontend/public/

async def main():
    conn = await asyncpg.connect(DSN)
    try:
        # Inspect device_schemas table columns
        cols = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_name='device_schemas' ORDER BY ordinal_position")
        print("columns:", [r["column_name"] for r in cols])
        # Show current row(s)
        try:
            rows = await conn.fetch("SELECT id, brand, model, exploded_view_url FROM device_schemas ORDER BY id DESC LIMIT 5")
            for r in rows:
                print("row:", r["id"], r["brand"], r["model"], "url=", r["exploded_view_url"])
        except Exception as e:
            print("list-err:", e)
        # Update the Apple/iPhone 13 Pro schema
        res = await conn.execute("UPDATE device_schemas SET exploded_view_url=$1 WHERE brand=$2 AND model=$3",
                                 NEW_URL, "Apple", "iPhone 13 Pro")
        print("UPDATE result:", res)
        # Verify
        rows = await conn.fetch("SELECT id, brand, model, exploded_view_url FROM device_schemas WHERE brand='Apple' AND model='iPhone 13 Pro'")
        for r in rows:
            print("updated:", r["id"], r["brand"], r["model"], "->", r["exploded_view_url"])
    finally:
        await conn.close()

asyncio.run(main())
