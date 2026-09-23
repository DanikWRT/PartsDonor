import asyncio, os, sys
for line in open('/home/aifactory/PartsDonor/backend/.env').read().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        k, _, v = line.partition('=')
        os.environ.setdefault(k.strip(), v.strip().strip('"'))
sys.path.insert(0, '/home/aifactory/PartsDonor/backend')
from app.db import async_session_factory
from app.models import Deal
from sqlalchemy import select

async def main():
    async with async_session_factory() as db:
        rows = (await db.execute(select(Deal.id, Deal.status, Deal.buyer_company_id, Deal.seller_company_id, Deal.amount_rub))).all()
        for i, s, b, se, a in rows:
            print(str(i), s, 'buyer=', str(b)[:8], 'seller=', str(se)[:8], a)

asyncio.run(main())
