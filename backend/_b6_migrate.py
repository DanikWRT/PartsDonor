"""One-off миграция B6: пересоздать deals (новые статусы escrow + колонки) в dev БД.

Старый enum deal_status (paid_escrow и т.д.) заменён новым набором (escrow_paid,
seller_confirmed, buyer_confirmed, payout). Добавлены колонки seller_company_id и
transitions. Данные по сделкам в dev отсутствуют → просто дропаем и пересоздаём.
"""

import asyncio

from sqlalchemy import text

from app.db import engine
from app.models import Base


async def main() -> None:
    async with engine.begin() as conn:
        # reviews ссылается на deals (FK) → дропаем обе; данные тестовые.
        await conn.execute(text("DROP TABLE IF EXISTS reviews CASCADE"))
        await conn.execute(text("DROP TABLE IF EXISTS deals CASCADE"))
        await conn.execute(text("DROP TYPE IF EXISTS deal_status CASCADE"))
        # пересоздаём таблицы/типы по актуальным моделям
        await conn.run_sync(Base.metadata.create_all)
        print("deals/escrow schema rebuilt")


asyncio.run(main())
