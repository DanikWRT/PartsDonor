"""UX-1 live verify: покупка в 1 клик для верифицированного B2B-покупателя."""
import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8001"
BUYER_EMAIL = "ux1demo.verify@gmail.com"
BUYER_PASS = "buyer123"

results = []


def call(method, path, body=None, token=None):
    hdrs = {"Content-Type": "application/json"}
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers=hdrs,
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def check(name, ok, detail=""):
    results.append((name, ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def login(email, password):
    s, d = call("POST", "/auth/login", {"email": email, "password": password})
    return d.get("access_token"), d.get("company_id")


# --- a) PUT /buyer-profile ---
tok, buyer_co = login(BUYER_EMAIL, BUYER_PASS)
check("login buyer", bool(tok and buyer_co), str(buyer_co))
s, prof = call("PUT", "/buyer-profile", {
    "billing_payer_name": "ООО Ромашка",
    "billing_inn": "7701234567",
    "default_address": "Москва, Ленина 10",
}, tok)
check("PUT /buyer-profile 200", s == 200, f"status={s} {prof}")
check("profile echo", prof.get("billing_payer_name") == "ООО Ромашка"
      and prof.get("billing_inn") == "7701234567"
      and prof.get("default_address") == "Москва, Ленина 10", str(prof))

# --- b) GET /buyer-profile ---
s, prof2 = call("GET", "/buyer-profile", token=tok)
check("GET /buyer-profile 200", s == 200 and prof2.get("billing_inn") == "7701234567", f"status={s}")

# --- c) find active listing, POST /deals/one-click ---
s, listings = call("GET", "/listings")
listing = None
for l in listings:
    if l.get("status") == "active" and l.get("seller_id") and l["seller_id"] != buyer_co:
        listing = l
        break
check("active listing found", listing is not None, listing and listing["id"])
s, oc = call("POST", "/deals/one-click", {"listing_id": listing["id"]}, tok)
check("POST /deals/one-click 201", s == 201, f"status={s}")
deal = oc.get("deal", {})
pay = oc.get("payment") or {}
check("deal.shipping_address == default", deal.get("shipping_address") == "Москва, Ленина 10",
      deal.get("shipping_address", ""))
check("payer fields echoed", oc.get("billing_payer_name") == "ООО Ромашка"
      and oc.get("billing_inn") == "7701234567", "")
check("payment.test true", pay.get("test") is True, str(pay.get("test")))
check("deal.buyer_company_id == buyer company", deal.get("buyer_company_id") == buyer_co, "")
check("deal.seller_company_id == listing seller",
      deal.get("seller_company_id") == listing.get("seller_id"), "")
check("deal.status created", deal.get("status") == "created", str(deal.get("status")))
check("deal.escrow_status created", deal.get("escrow_status") == "created", str(deal.get("escrow_status")))
deal_id = deal.get("id")

# --- d) NEGATIVE: fresh unverified buyer -> 403 ---
NEG_EMAIL = "ux1neg.verify@gmail.com"
NEG_PASS = "buyer123"
s, r = call("POST", "/auth/register", {
    "email": NEG_EMAIL, "password": NEG_PASS, "role": "buyer",
})
if s == 409:
    pass  # already exists
ntok, nco = login(NEG_EMAIL, NEG_PASS)
check("negative buyer registered+login", bool(ntok), str(nco))
s, r = call("POST", "/deals/one-click", {"listing_id": listing["id"]}, ntok)
check("negative one-click 403 (not verified)", s == 403, f"status={s} detail={r.get('detail')}")
s, listings_after = call("GET", "/listings")
l2 = next((x for x in listings_after if x["id"] == listing["id"]), None)
check("listing not double-booked by unverified", l2 and l2["status"] == "negotiated",
      f"status={l2 and l2['status']} (set by verified buyer's deal, unchanged after 403)")

# --- e) GET /deals contains the one-click deal ---
s, deals = call("GET", "/deals")
found = any(d["id"] == deal_id for d in deals)
check("GET /deals contains one-click deal", found and s == 200, str(deal_id))

ok = all(x[1] for x in results)
print("UX1-VERIFY:", "ALL PASS" if ok else "SOME FAILED")
