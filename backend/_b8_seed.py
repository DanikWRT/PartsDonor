"""One-off seed B8: админ-аккаунт (idempotent)."""
import asyncio

from sqlalchemy import select

from app.auth import hash_password
from app.db import async_session_factory
from app.models import User, UserRole

ADMIN_EMAIL = "admin@partsdonor.example.com"


async def main() -> None:
    async with async_session_factory() as s:
        exists = (await s.execute(select(User).where(User.email == ADMIN_EMAIL))).scalar_one_or_none()
        if exists is None:
            s.add(User(email=ADMIN_EMAIL, password_hash=hash_password("admin123"), role=UserRole.admin))
            await s.commit()
            print("admin seeded:", ADMIN_EMAIL)
        else:
            print("admin exists")


asyncio.run(main())
