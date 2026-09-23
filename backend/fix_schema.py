"""One-off: show alembic revision + list migration files."""
import asyncio
import pathlib

from sqlalchemy import text

from app.db import engine


async def main() -> None:
    async with engine.connect() as conn:
        v = (await conn.execute(text("select version_num from alembic_version"))).scalar()
        print("alembic version:", v)
    for p in pathlib.Path("migrations/versions").glob("*.py"):
        print("file:", p.name)


asyncio.run(main())
