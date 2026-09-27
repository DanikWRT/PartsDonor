"""PERF-1 shape verification: confirm e2e response shapes didn't regress."""
import json

listings = json.load(open("/tmp/perf1_listings.json"))
deals = json.load(open("/tmp/perf1_deals.json"))
lots = json.load(open("/tmp/perf1_lots.json"))

print("listings count:", len(listings))
if listings:
    l = listings[0]
    print("listing keys:", sorted(l.keys()))
    print("part_name:", l.get("part_name"), "| part_category:", l.get("part_category"))
    sl = {k: v for k, v in l.items() if k.startswith("seller")}
    print("seller fields:", sl)

print()
print("deals count:", len(deals))
if deals:
    d = deals[0]
    print("deal keys:", sorted(d.keys()))
    print("buyer:", d.get("buyer"))
    print("seller:", d.get("seller"))

print()
print("donor-lots count:", len(lots))
if lots:
    lt = lots[0]
    print("lot keys:", sorted(lt.keys()))
    for f in ["seller_name", "seller_rating", "seller_verified", "listing_id"]:
        print("  %s: %s" % (f, lt.get(f)))
