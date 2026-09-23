"""UX-1 seed: создать/верифицировать демо-покупателя ux1demo.verify@gmail.com."""
import asyncio
import uuid

from sqlalchemy import select

from app.db import async_session_factory as async_session
from app.models import Company, User


async def main() -> None:
    email = "ux1demo.verify@gmail.com"
    async with async_session() as db:
        user = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if user is None:
            company = Company(name="UX1 Demo Buyer", role="buyer", slug=f"ux1-demo-{uuid.uuid4().hex[:8]}")
            db.add(company)
            await db.flush()
            user = User(
                email=email,
                password_hash="$2b$12$KIXQ2pJ3t0yP8F0uZ2K1auvXo7vQZ5bX6mS0R2uK9qC0H8Y3lZ1iO",  # "buyer123" placeholder
                role="buyer",
                company_id=company.id,
            )
            from app.auth import hash_password
            user.password_hash = hash_password("buyer123")
            db.add(user)
        company = await db.get(Company, user.company_id)
        company.verified = True
        await db.commit()
        print(f"company_id={company.id} verified={company.verified} user={user.email} user_id={user.id}")


asyncio.run(main())
