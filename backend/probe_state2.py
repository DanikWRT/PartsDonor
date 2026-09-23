"""Probe the marketplace DB state and verify tables exist."""
import asyncio
from sqlalchemy import text, select

from app.db import async_session_factory


async def main():
    async with async_session_factory() as db:
        for t in ["companies", "device_schemas", "listings", "deals", "reviews"]:
            try:
                n = (await db.execute(text(f"SELECT count(*) FROM {t}"))).scalar()
                print(f"table {t}: {n} rows")
            except Exception as e:
                print(f"table {t}: ERROR {e}")


if __name__ == "__main__":
    asyncio.run(main())
