"""Create/find a seller user owned by СмартРемонт (e6f223e6) for S1 verification."""
import asyncio
import uuid
from sqlalchemy import select
from app.db import async_session_factory
from app.models import User, UserRole
from app.auth import hash_password

EMAIL = "donor.seller.verify@gmail.com"
PASSWORD = "seller123"
COMPANY = uuid.UUID("e6f223e6-7542-4e15-bdd5-86c87a3a6ce9")

async def main():
    async with async_session_factory() as db:
        u = (await db.execute(select(User).where(User.email == EMAIL))).scalar_one_or_none()
        if u:
            print(f"Seller exists: id={u.id} company_id={u.company_id}")
            return
        rec = User(
            email=EMAIL,
            password_hash=hash_password(PASSWORD),
            role=UserRole.seller,
            company_id=COMPANY,
        )
        db.add(rec)
        await db.commit()
        await db.refresh(rec)
        print(f"Created seller: id={rec.id} email={rec.email} company_id={rec.company_id}")

asyncio.run(main())
