"""Read-only check: InvenTree donor part + BOM intact (acceptance: don't break InvenTree)."""
from app.inventree_client import inventree

# Donor part
donor = inventree.get_part(6)
print("donor part pk=6:", donor.get("name"), "| assembly:", donor.get("assembly"))

# BOM subs
subs = inventree.get_bom_subs(6)
print(f"BOM subs for donor 6: {len(subs)} components")
for s in subs:
    print(f"   part_id={s['part_id']} x{s['quantity']} {s['name']} [{s['category']}]")

# Stock count (read-only)
stock = inventree.list_stock()
print(f"stock items total: {len(stock)}")
