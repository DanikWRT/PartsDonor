"""S1 seed: create a donor lot for Apple/iPhone 13 Pro (idempotent)."""
import asyncio
import sys
sys.path.insert(0, '.')
from app.db import async_session_factory
from sqlalchemy import select, text
from app.models import DonorLot, DeviceSchema, Company, ListingStatus, PartCondition

async def main():
    DEVICE_SCHEMA_ID = "a54da2f9-2873-4003-92d7-62180297d76d"
    SELLER_ID = "e6f223e6-7542-4e15-bdd5-86c87a3a6ce9"
    async with async_session_factory() as s:
        # check idempotent
        existing = await s.execute(
            select(DonorLot).where(
                DonorLot.device_schema_id == DEVICE_SCHEMA_ID,
                DonorLot.seller_id == SELLER_ID,
            )
        )
        if existing.scalar_one_or_none():
            print("Donor lot already exists — skipping")
            return
        # create donor lot
        lot = DonorLot(
            device_schema_id=DEVICE_SCHEMA_ID,
            seller_id=SELLER_ID,
            title="Донор iPhone 13 Pro (комплект)",
            price_rub=38000,
            condition=PartCondition.for_parts,
            provenance="Полный донор, весь BOM в наличии",
            status=ListingStatus.active,
        )
        s.add(lot)
        await s.commit()
        await s.refresh(lot)
        print(f"Created donor lot: {lot.id} - {lot.title}")

asyncio.run(main())
