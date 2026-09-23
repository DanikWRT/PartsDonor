import asyncio, os, sys
for line in open('/home/aifactory/PartsDonor/backend/.env').read().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        k, _, v = line.partition('=')
        os.environ.setdefault(k.strip(), v.strip().strip('"'))
sys.path.insert(0, '/home/aifactory/PartsDonor/backend')
from app.db import async_session_factory
from app.models import Listing, Deal, Review, Company
from sqlalchemy import select, func

async def main():
    async with async_session_factory() as db:
        print('--- LISTINGS (company -> title, price, status) ---')
        rows = (await db.execute(select(Listing.id, Listing.seller_id, Listing.title, Listing.price_rub, Listing.status))).all()
        for i, s, p, pr, st in rows:
            print(f'  {str(i)[:8]}  seller={str(s)[:8]}  {p}  {pr}  {st}')
        print('--- DEALS ---')
        rows = (await db.execute(select(Deal.id, Deal.status, Deal.escrow_status, Deal.amount_rub, Deal.buyer_company_id, Deal.seller_company_id))).all()
        for i, s, e, a, b, se in rows:
            print(f'  {str(i)[:8]}  status={s:18} escrow={e:12} {a}  buyer={str(b)[:8]} seller={str(se)[:8]}')
        print('--- REVIEWS ---')
        n = (await db.execute(select(func.count()).select_from(Review))).scalar()
        print('  count=', n)
        if n:
            for r in (await db.execute(select(Review.deal_id, Review.seller_id, Review.rating, Review.comment))).all():
                print('  deal=', str(r[0])[:8], 'seller=', str(r[1])[:8], 'rating=', r[2], '|', r[3])
        print('--- COMPANIES for buyer_i1 / seller_693be6 ---')
        rows = (await db.execute(select(Company.name, Company.role, Company.id))).all()
        for n, r, i in rows:
            if '693be6' in n or 'i1' in n or 'rev' in n:
                print(f'  {r:6} {n}  {i}')

asyncio.run(main())
