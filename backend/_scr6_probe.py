import asyncio

async def main():
    from app.db import engine
    from sqlalchemy import text
    async with engine.connect() as c:
        r = await c.execute(text(
            "select table_name from information_schema.tables "
            "where table_schema=current_schema() "
            "and table_name in ('dialogs','messages','offers','dialog_participants') order by 1"
        ))
        print('chat tables present:', [x[0] for x in r.all()])
        r2 = await c.execute(text("select version_num from alembic_version"))
        print('alembic_version:', [x[0] for x in r2.all()])

asyncio.run(main())
