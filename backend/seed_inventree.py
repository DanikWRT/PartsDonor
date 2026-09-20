"""Seed InvenTree тестовыми данными PartsDonor.

Создаёт:
  - Категории: Дисплеи, Платы, АКБ, Камеры, Корпусные, Доноры
  - Донор «iPhone 13 Pro (донор)» + его компоненты как BOM (дисплей, плата, АКБ, камера, корпус)
  - StockItem'ы (экземпляры на складе) для каждого компонента

ЗАПУСК:
  cd backend && .venv/bin/python seed_inventree.py
"""

from __future__ import annotations

from app.inventree_client import inventree

# Категории: (имя, parent=None)
CATEGORIES = [
    ("Дисплеи",),
    ("Материнские платы",),
    ("Аккумуляторы",),
    ("Камеры",),
    ("Корпусные части",),
    ("Доноры",),
]

# Донор: часть-родитель + список компонентов (имя, категория, цена, количество в доноре)
DONOR = {
    "name": "iPhone 13 Pro (донор)",
    "category": "Доноры",
    "components": [
        ("Дисплей iPhone 13 Pro (ориг.)", "Дисплеи", 1),
        ("Материнская плата iPhone 13 Pro (ориг.)", "Материнские платы", 1),
        ("Аккумулятор iPhone 13 Pro (ориг.)", "Аккумуляторы", 1),
        ("Основная камера iPhone 13 Pro (ориг.)", "Камеры", 1),
        ("Корпус iPhone 13 Pro (ориг.)", "Корпусные части", 1),
    ],
}


def seed() -> None:
    cat_ids: dict[str, int] = {}

    # 1. Категории (создаём только если нет — идемпотентно по имени)
    existing = {c["name"]: c["pk"] for c in inventree.list_categories()}
    for (name,) in CATEGORIES:
        if name in existing:
            cat_ids[name] = existing[name]
        else:
            c = inventree.create_category(name)
            cat_ids[name] = c["pk"]
            print(f"  категория: {name} (id={c['pk']})")

    # 2. Донор-родитель + компоненты
    donor_cat = cat_ids[DONOR["category"]]
    parts = {p["name"]: p["pk"] for p in inventree.list_parts()}

    # Создаём компоненты
    comp_cat = {}
    for name, cat_name, _qty in DONOR["components"]:
        comp_cat[name] = cat_ids[cat_name]
        if name not in parts:
            p = inventree.create_part(name, category=cat_ids[cat_name],
                                      description=f"Б/у компонент, снят с донора iPhone 13 Pro")
            parts[name] = p["pk"]
            print(f"  part: {name} (id={p['pk']})")

    # Создаём донора-родителя (assembly=True — в InvenTree BOM строятся только для сборок)
    donor_pk = None
    if DONOR["name"] not in parts:
        d = inventree.create_part(DONOR["name"], category=donor_cat,
                                  description="Донор — битое устройство, разбирается на компоненты",
                                  assembly=True)
        donor_pk = d["pk"]
        parts[DONOR["name"]] = donor_pk
        print(f"  part (донор, assembly=True): {DONOR['name']} (id={donor_pk})")
    else:
        donor_pk = parts[DONOR["name"]]
        # Если донор уже есть, но не assembly — включим (иначе BOM не создастся)
        donor_info = inventree.request("GET", f"part/{donor_pk}/")
        if not donor_info.get("assembly"):
            inventree.update_part(donor_pk, assembly=True)
            print(f"  part (донор) -> assembly=True (id={donor_pk})")

    # 3. BOM: донор -> каждый компонент
    bom_items = inventree.list_bom_items(donor_pk)
    bom_sub = {b["sub_part"] for b in bom_items}
    for name, _cat, qty in DONOR["components"]:
        sub = parts[name]
        if sub not in bom_sub:
            b = inventree.create_bom_item(donor_pk, sub, quantity=qty, reference=f"{name}")
            print(f"  BOM: {DONOR['name']} -> {name} (qty={qty})")

    # 4. Склад (StockItem) — по 1 шт каждого компонента
    stocks = {s["part"] for s in inventree.list_stock()}
    for name, _cat, _qty in DONOR["components"]:
        part_pk = parts[name]
        if part_pk not in stocks:
            s = inventree.create_stock(part_pk, quantity=1)
            print(f"  stock: {name} (1 шт)")

    print("SEED DONE")


if __name__ == "__main__":
    seed()
