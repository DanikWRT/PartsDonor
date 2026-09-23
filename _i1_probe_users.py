import asyncio, os, sys
from pathlib import Path
for line in Path('/home/aifactory/PartsDonor/backend/.env').read_text().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        k, _, v = line.partition('=')
        os.environ.setdefault(k.strip(), v.strip().strip('"'))
sys.path.insert(0, '/home/aifactory/PartsDonor/backend')
from app.db import async_session_factory
from app.models import User, Company
from sqlalchemy import select

async def main():
    sf = async_session_factory
    async with sf() as db:
        rows = (await db.execute(select(User.email, User.role, User.company_id))).all()
        print('USERS:')
        for e, r, c in rows:
            print(f"  {r:8} {e:40} company={c}")
        comps = (await db.execute(select(Company.id, Company.name, Company.role))).all()
        print('COMPANIES:')
        for i, n, r in comps:
            print(f"  {r:8} {i}  {n}")

asyncio.run(main())
