"""Drop our marketplace tables (dev DB, торговый слой — не InvenTree) для чистого baseline."""

import asyncio

import asyncpg


async def main() -> None:
    c = await asyncpg.connect(
        host="127.0.0.1", port=5433, user="pduser", password="pdpass", database="partsdonor"
    )
    await c.execute("DROP TABLE IF EXISTS reviews, deals, listings, device_schemas, companies CASCADE")
    print("dropped marketplace tables")
    await c.close()


asyncio.run(main())
