"""End-to-end curl-equivalent test against the live PartsDonor backend (8001).

Covers the T1 acceptance criteria: GET catalog, GET donor, POST listing
(seller cabinet), create deal with status transitions, reviews.
Prints a clear PASS/FAIL per step. Does NOT touch InvenTree data.
"""
import json
import sys
import urllib.request

BASE = "http://127.0.0.1:8001"


def call(method, path, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def check(label, ok, extra=None):
    print(("PASS " if ok else "FAIL ") + label + ("  | " + str(extra) if extra is not None else ""))
    return ok


ok_all = True

# 1. GET /catalog (list of parts from InvenTree)
st, cat = call("GET", "/catalog?search=iPhone")
ok_all &= check("GET /catalog (iPhone)", st == 200 and isinstance(cat, list), (st, cat[:2] if isinstance(cat, list) else cat))

# 2. GET /donor/6
st, donor = call("GET", "/donor/6")
ok_all &= check("GET /donor/6", st == 200 and isinstance(donor.get("components"), list),
                (st, donor.get("model"), len(donor.get("components", []))))

# 3. GET /device-schemas
st, ds = call("GET", "/device-schemas")
ok_all &= check("GET /device-schemas", st == 200 and isinstance(ds, list),
                (st, f"{len(ds)} schemas" if isinstance(ds, list) else ds))

# 4. GET /companies (need seller for listing/deal)
st, companies = call("GET", "/companies")
ok_all &= check("GET /companies", st == 200 and isinstance(companies, list) and len(companies) > 0,
                (st, len(companies) if isinstance(companies, list) else companies))
seller = next((c for c in companies if c.get("role") == "seller"), companies[0] if companies else None)
buyer = next((c for c in companies if c.get("role") == "buyer"), seller)

# 5. POST /listings (seller cabinet)
listing_payload = {
    "title": "T1 curl-test listing: датчик Face ID iPhone 13 Pro",
    "price_rub": 4900,
    "condition": "working",
    "provenance": "curl end-to-end test, создан через POST /listings",
    "inventree_part_id": 5,
    "seller_id": seller["id"] if seller else None,
}
st, listing = call("POST", "/listings", listing_payload)
ok_all &= check("POST /listings", st == 201 and listing.get("status") == "active",
                (st, listing.get("title"), listing.get("status")))
listing_id = listing.get("id")

# 6. PATCH listing -> hidden (cabinet status change)
if listing_id:
    st, l2 = call("PATCH", f"/listings/{listing_id}", {"status": "hidden"})
    ok_all &= check("PATCH /listings status=hidden", st == 200 and l2.get("status") == "hidden", (st, l2.get("status")))
    # back to active for deal test
    call("PATCH", f"/listings/{listing_id}", {"status": "active"})

# 7. POST /deals (create deal -> created, listing -> negotiated)
deal_created = False
if listing_id and buyer:
    st, deal = call("POST", "/deals", {
        "listing_id": listing_id,
        "buyer_company_id": buyer["id"],
        "amount_rub": 4900,
        "shipping_address": "Москва, тест"
    })
    deal_created = (st == 201 and deal.get("status") == "created")
    ok_all &= check("POST /deals (created)", deal_created, (st, deal.get("status") if isinstance(deal, dict) else deal))
    deal_id = deal.get("id")
    # listing auto-reserved
    st, lres = call("GET", f"/listings/{listing_id}")
    ok_all &= check("listing auto -> negotiated on deal", lres.get("status") == "negotiated", (lres.get("status")))

    # 8. Deal status machine transitions
    if deal_id:
        for target, ok_status in [("paid_escrow", "paid"), ("shipped", "in_progress"),
                                  ("delivered", "in_progress"), ("completed", "released")]:
            st, d = call("PATCH", f"/deals/{deal_id}/status", {"status": target})
            ok = st == 200 and d.get("status") == target and d.get("escrow_status") == ok_status
            ok_all &= check(f"deal -> {target} (escrow={ok_status})", ok, (st, d.get("status"), d.get("escrow_status")))
        # invalid transition rejected
        st, d = call("PATCH", f"/deals/{deal_id}/status", {"status": "completed"})
        ok_all &= check("invalid transition completed->completed rejected", st == 400, st)

# 9. POST /reviews
if seller:
    st, rev = call("POST", "/reviews", {"rating": 5, "comment": "curl test отзыв", "seller_id": seller["id"]})
    ok_all &= check("POST /reviews", st == 201 and rev.get("rating") == 5, (st, rev.get("rating")))
    st, updated = call("GET", f"/companies/{seller['id']}")
    ok_all &= check("company rating recomputed", updated.get("rating", 0) > 0, (updated.get("rating")))

# 10. GET /reviews
st, revs = call("GET", "/reviews")
ok_all &= check("GET /reviews", st == 200 and isinstance(revs, list), (st, len(revs) if isinstance(revs, list) else revs))

print("\n==== T1 END-TO-END TEST: " + ("ALL PASS" if ok_all else "SOME FAILED") + " ====")
sys.exit(0 if ok_all else 1)
