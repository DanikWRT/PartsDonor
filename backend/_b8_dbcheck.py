import asyncio
from sqlalchemy import select
from app.db import async_session_factory
from app.models import User, Company


async def main():
    async with async_session_factory() as s:
        try:
            users = (await s.execute(select(User))).scalars().all()
            print("users count:", len(users))
            for u in users:
                print(" -", u.email, u.role, "company_id=", u.company_id)
        except Exception as e:
            print("ERR users:", repr(e))
        try:
            comps = (await s.execute(select(Company))).scalars().all()
            print("companies count:", len(comps))
            for c in comps:
                print(" -", c.id, c.name, c.slug, c.role)
        except Exception as e:
            print("ERR companies:", repr(e))


asyncio.run(main())
