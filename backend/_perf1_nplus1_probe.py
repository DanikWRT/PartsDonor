'''PERF-1 N+1 proof: run the same list queries with selectinload, counting SQL
queries, and confirm relationship attributes are accessible without lazy loads.

Run: /home/aifactory/PartsDonor/backend/.venv/bin/python _perf1_nplus1_probe.py (cwd: backend/)
'''
import asyncio
from sqlalchemy import event, select
from sqlalchemy.orm import selectinload
from app.db import async_session_factory, engine
from app.models import Listing, Deal, DonorLot

COUNT = {"n": 0}

@event.listens_for(engine.sync_engine, "before_cursor_execute")
def _count(_conn, _cur, _st, _par, _ex, _ctx):
    COUNT["n"] += 1

async def main():
    async with async_session_factory() as db:
        # 1) LISTINGS
        COUNT["n"] = 0
        stmt = select(Listing).options(selectinload(Listing.seller))
        records = list((await db.execute(stmt)).scalars().all())
        q_listings = COUNT["n"]
        accessed = 0
        for r in records:
            _ = r.seller
            accessed += 1
        q_after_listings = COUNT["n"]
        print(f"[listings] rows={len(records)} queries_before={q_listings} queries_after_seller_access={q_after_listings} (no delta = eager OK) seller_accessed={accessed}")

        # 2) DEALS
        COUNT["n"] = 0
        stmt = select(Deal).options(selectinload(Deal.buyer), selectinload(Deal.seller))
        deals = list((await db.execute(stmt)).scalars().all())
        q_deals = COUNT["n"]
        b = sum(1 for d in deals if d.buyer)
        s = sum(1 for d in deals if d.seller)
        q_after_deals = COUNT["n"]
        print(f"[deals] rows={len(deals)} queries_before={q_deals} queries_after_party_access={q_after_deals} buyers={b} sellers={s}")

        # 3) DONOR LOTS (batched listing lookup -> constant queries regardless of N)
        COUNT["n"] = 0
        stmt = select(DonorLot).options(selectinload(DonorLot.seller), selectinload(DonorLot.device_schema))
        lots = list((await db.execute(stmt)).scalars().all())
        q0 = COUNT["n"]
        # replicate the batched listing lookup from main.py
        lot_ids = [l.id for l in lots]
        listings = {}
        if lot_ids:
            rows = list((await db.execute(select(Listing).where(Listing.donor_lot_id.in_(lot_ids)))).scalars().all())
            for l in rows:
                if l.donor_lot_id is not None:
                    listings[l.donor_lot_id] = l.id
        q_final = COUNT["n"]
        sn = sum(1 for l in lots if l.seller)
        print(f"[donor_lots] rows={len(lots)} queries_for_lots+rels={q0} queries_after_batched_listings={q_final} seller_present={sn} listing_map_entries={len(listings)}")

asyncio.run(main())
