"""S1: Seed donor lot idempotently (Apple/iPhone 13 Pro)."""
import asyncio
import uuid

from app.db import async_session_factory
from app.models import DonorLot, ListingStatus, PartCondition, DeviceSchema, Company


async def main():
    async with async_session_factory() as db:
        # Проверяем, уже ли есть лот для этой связки device_schema + seller
        stmt = db.execute(
            db.select(DonorLot)
            .where(DonorLot.device_schema_id == uuid.UUID("a54da2f9-2873-4003-92d7-62180297d76d"))
            .where(DonorLot.seller_id == uuid.UUID("e6f223e6-7542-4e15-bdd5-86c87a3a6ce9"))
        )
        existing = stmt.scalar_one_or_none()
        if existing:
            print(f"Donor lot already exists: id={existing.id} title={existing.title}")
            return

        record = DonorLot(
            device_schema_id=uuid.UUID("a54da2f9-2873-4003-92d7-62180297d76d"),
            seller_id=uuid.UUID("e6f223e6-7542-4e15-bdd5-86c87a3a6ce9"),
            title="Донор iPhone 13 Pro (комплект)",
            price_rub=38000.0,
            condition=PartCondition.for_parts,
            provenance="Полный донор, весь BOM в наличии",
            status=ListingStatus.active,
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)
        print(f"Created donor lot: id={record.id} title={record.title} price={record.price_rub}")


if __name__ == "__main__":
    asyncio.run(main())
