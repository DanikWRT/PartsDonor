import asyncio
from app.db import async_session_factory
from sqlalchemy import text

async def main():
    async with async_session_factory() as s:
        r = await s.execute(text("select tablename from pg_tables where schemaname='public' order by tablename"))
        print('TABLES:', ' '.join(x[0] for x in r.fetchall()))
        for t in ['donor_lots', 'donor_requests']:
            try:
                r = await s.execute(text(f'select count(*) from {t}'))
                print(t, 'count=', r.scalar())
            except Exception as e:
                print(t, 'ERR', repr(e))
        # donor_lots rows
        try:
            r = await s.execute(text('select id, title, price_rub, status, device_schema_id from donor_lots limit 10'))
            for row in r.fetchall():
                print('LOT:', row)
        except Exception as e:
            print('lot rows ERR', repr(e))
        # check schema model has donor_lot_id in listings
        try:
            r = await s.execute(text("select column_name from information_schema.columns where table_name='listings' and column_name='donor_lot_id'"))
            print('listings.donor_lot_id exists:', r.scalar() is not None)
        except Exception as e:
            print('listing col ERR', repr(e))

asyncio.run(main())
