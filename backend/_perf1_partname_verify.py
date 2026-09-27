"""PERF-1: confirm at least some listings have non-null part_name (batch InvenTree works)."""
import json

listings = json.load(open("/tmp/perf1_listings.json"))

with_pn = [l for l in listings if l.get("part_name")]
with_pid = [l for l in listings if l.get("inventree_part_id") is not None]
print("listings total:", len(listings))
print("with inventree_part_id:", len(with_pid))
print("with non-null part_name:", len(with_pn))
print("with non-null part_category:", len([l for l in listings if l.get("part_category")]))

# first record detail
l0 = listings[0]
print("first listing inventree_part_id:", l0.get("inventree_part_id"), "part_name:", l0.get("part_name"))

# sample a non-null one
for l in listings:
    if l.get("part_name"):
        print("sample part_name:", l["part_name"], "| part_category:", l.get("part_category"), "| pid:", l.get("inventree_part_id"))
        break
