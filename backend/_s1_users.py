"""Find a seller user belonging to СмартРемонт (e6f223e6...)."""
import asyncio
import uuid
from sqlalchemy import select
from app.db import async_session_factory
from app.models import User

COMPANY = uuid.UUID("e6f223e6-7542-4e15-bdd5-86c87a3a6ce9")

async def main():
    async with async_session_factory() as db:
        users = (await db.execute(select(User))).scalars().all()
        for u in users:
            cid = str(getattr(u, "company_id", "") or "")
            mark = " <== SELLER" if cid == str(COMPANY) else ""
            print(f"{u.email} | role={getattr(u,'role',None)} | company_id={cid}{mark}")

asyncio.run(main())
