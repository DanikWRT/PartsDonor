import asyncio, sys
sys.path.insert(0, '.')
from app.db import async_session_factory
from sqlalchemy import text

async def main():
    async with async_session_factory() as s:
        r = await s.execute(text('select id,brand,model,inventree_donor_part_id from device_schemas'))
        print('DEVICE SCHEMAS:', r.fetchall())
        r = await s.execute(text('select id,title,price_rub,status,inventree_part_id,seller_id,device_schema_id from listings'))
        print('LISTINGS:', r.fetchall())
        r = await s.execute(text('select id,name,role,verified from companies'))
        print('COMPANIES:', r.fetchall())
        r = await s.execute(text('select email,role,company_id from users'))
        print('USERS:', r.fetchall())
        r = await s.execute(text("select table_name from information_schema.tables where table_schema='public' order by table_name"))
        print('TABLES:', [x[0] for x in r.fetchall()])

asyncio.run(main())
