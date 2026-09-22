"""Seed таблиц нашего торгового слоя (PostgreSQL partsdonor) тестовыми данными.

Создаёт (идемпотентно — не дублирует существующие):
  - 2 компании-мастерские (продавец СмартРемонт, покупатель ЧиниМир)
  - device_schema «iPhone 13 Pro» (hotspots для развёртки), привязан к Part-донору InvenTree pk=6
  - 5 листингов компонентов донора (дисплей/плата/АКБ/камера/корпус), ссылки на Part InvenTree

Данные InvenTree НЕ трогаем (source of truth — уже там: донор pk6 + BOM + StockItem).

ЗАПУСК:
  cd backend && .venv/bin/python seed.py
"""

from __future__ import annotations

from sqlalchemy import select

from app.config import settings
from app.db import async_session_factory
from app.models import (
    Company,
    DeviceSchema,
    Listing,
    ListingStatus,
    PartCondition,
)

# Донор как BOM (InvenTree Part pk — см. InvenTree-State.md)
DONOR_PART_ID = 6  # «iPhone 13 Pro (донор)» assembly

# Компоненты донора: (part_pk, имя, слот, цена, состояние, история)
COMPONENTS = [
    (1, "Дисплей iPhone 13 Pro (ориг.)", "display", 25900, PartCondition.working,
     "Снят с донора iPhone 13 Pro, без царапин, проверен"),
    (2, "Материнская плата iPhone 13 Pro (ориг.)", "board", 14900, PartCondition.for_parts,
     "Снят с донора, после падения, плата не восстановлена"),
    (3, "Аккумулятор iPhone 13 Pro (ориг.)", "battery", 2900, PartCondition.working,
     "Оригинальный АКБ, ёмкость 87%"),
    (4, "Основная камера iPhone 13 Pro (ориг.)", "camera", 8900, PartCondition.no_guarantee,
     "Снят с донора, без гарантии, требует проверки"),
    (5, "Корпус iPhone 13 Pro (ориг.)", "backcover", 3900, PartCondition.working,
     "Б/у корпус, царапины по торцам"),
]

# Размещение слотов на развёртке (нормализованные координаты 0..1)
HOTSPOTS = {
    "display": {"x": 0.5, "y": 0.13},
    "board": {"x": 0.5, "y": 0.34},
    "battery": {"x": 0.5, "y": 0.52},
    "camera": {"x": 0.5, "y": 0.70},
    "backcover": {"x": 0.5, "y": 0.87},
}


async def seed() -> None:
    async with async_session_factory() as db:
        # --- Компании ---
        existing = set((await db.execute(select(Company.name))).scalars().all())
        seller = buyer = None
        if "СмартРемонт" not in existing:
            seller = Company(name="СмартРемонт", slug="smart-remont", role="seller",
                             rating=4.8, verified=True)
            db.add(seller)
            print("  company: СмартРемонт (seller)")
        if "ЧиниМир" not in existing:
            buyer = Company(name="ЧиниМир", slug="chini-mir", role="buyer",
                            rating=4.6, verified=False)
            db.add(buyer)
            print("  company: ЧиниМир (buyer)")
        await db.commit()
        await db.refresh(seller) if seller else None
        await db.refresh(buyer) if buyer else None

        if seller is None:
            seller = (await db.execute(select(Company).where(Company.name == "СмартРемонт"))).scalar_one()

        # --- device_schema ---
        schema = (
            await db.execute(select(DeviceSchema).where(DeviceSchema.model == "iPhone 13 Pro"))
        ).scalar_one_or_none()
        if schema is None:
            schema = DeviceSchema(
                brand="Apple",
                model="iPhone 13 Pro",
                inventree_donor_part_id=DONOR_PART_ID,
                exploded_view_url="/exploded-view.jpg",
                hotspots=HOTSPOTS,
            )
            db.add(schema)
            await db.flush()
            print(f"  device_schema: Apple iPhone 13 Pro (id={schema.id})")

        # --- листинги компонентов ---
        existing_titles = set((await db.execute(select(Listing.title))).scalars().all())
        for part_pk, title, _slot, price, cond, prov in COMPONENTS:
            if title in existing_titles:
                continue
            db.add(Listing(
                title=title,
                price_rub=price,
                condition=cond,
                provenance=prov,
                status=ListingStatus.active,
                inventree_part_id=part_pk,
                device_schema_id=schema.id,
                seller_id=seller.id,
            ))
            print(f"  listing: {title} ({price} руб)")

        await db.commit()
    print("SEED DONE (торговый слой)")


if __name__ == "__main__":
    import asyncio

    asyncio.run(seed())
