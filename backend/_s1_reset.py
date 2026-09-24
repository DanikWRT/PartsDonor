"""S1 verify prep: reset donor lot to clean active state + report facts."""
import asyncio
import uuid

from sqlalchemy import select

from app.db import async_session_factory
from app.models import DonorLot, Listing, Deal, DonorRequest, DeviceSchema, Company, ListingStatus

LOT_ID = uuid.UUID("ba777dfc-7db7-43cd-8f6a-f707226f5a7d")

async def main():
    async with async_session_factory() as db:
        lot = (await db.execute(select(DonorLot).where(DonorLot.id == LOT_ID))).scalar_one_or_none()
        if not lot:
            print("LOT NOT FOUND"); return
        print(f"Lot status before: {lot.status}")
        lot.status = ListingStatus.active
        # Clean stale state: delete requests, reset/manage listing + deals
        reqs = (await db.execute(select(DonorRequest).where(DonorRequest.donor_lot_id == LOT_ID))).scalars().all()
        print(f"Existing requests: {len(reqs)}")
        for r in reqs:
            await db.delete(r)
        listings = (await db.execute(select(Listing).where(Listing.donor_lot_id == LOT_ID))).scalars().all()
        print(f"Existing listings for lot: {[(l.id, l.status) for l in listings]}")
        for l in listings:
            # mark listing active too, keep it (deal needs listing_id)
            l.status = ListingStatus.active
        deals = (await db.execute(select(Deal))).scalars().all()
        # find deals linked to our donor listings
        donor_listing_ids = {str(l.id) for l in listings}
        linked = [d for d in deals if str(d.listing_id) in donor_listing_ids]
        print(f"Deals linked to donor listing: {[(d.id, d.status) for d in linked]}")
        await db.commit()
        print(f"Lot status after: {lot.status}")
        # report
        schema = (await db.get(DeviceSchema, lot.device_schema_id))
        seller = (await db.get(Company, lot.seller_id))
        print(f"device_schema_id={lot.device_schema_id} donor_part_id={schema.inventree_donor_part_id if schema else None}")
        print(f"seller_id={lot.seller_id} seller_name={seller.name if seller else None}")

asyncio.run(main())
