"""Verify the thin InvenTree-client read path: donor iPhone13Pro with BOM + stock.

Acceptance for task t_a8e91b2c: GET the donor through the client, including its
BOM (children qty) and stock levels, all via the httpx REST client.
"""
from __future__ import annotations

import json
import sys

from app.inventree_client import inventree

DONOR_NAME = "iPhone 13 Pro (донор)"


def resolve_donor() -> dict:
    for p in inventree.list_parts():
        if p.get("name") == DONOR_NAME:
            return p
    return {}


def main() -> int:
    donor = resolve_donor()
    if not donor:
        print(f"FAIL: donor '{DONOR_NAME}' not found in InvenTree")
        return 1

    donor_pk = donor["pk"]
    print(f"OK donor: pk={donor_pk} name={donor['name']} assembly={donor.get('assembly')}")

    if not donor.get("assembly"):
        print("FAIL: donor is not assembly=True; BOM parent requires assembly")
        return 1

    bom = inventree.list_bom_items(donor_pk)
    if not bom:
        print("FAIL: no BOM items for donor")
        return 1
    print(f"OK BOM: {len(bom)} components")
    subs = []
    for b in bom:
        subs.append(b["sub_part"])
        print(f"  sub_part={b.get('sub_part')} qty={b.get('quantity')} ref={b.get('reference')}")

    stock = inventree.list_stock()
    parts_with_stock = {s.get("part") for s in stock}
    missing = [s for s in subs if s not in parts_with_stock]
    print(f"OK stock items total: {len(stock)}")
    if missing:
        print(f"FAIL: components without stock: {missing}")
        return 1
    print("OK: every donor component has stock")

    print("\nRESULT: donor+BOM+stock via client works")
    return 0


if __name__ == "__main__":
    sys.exit(main())
