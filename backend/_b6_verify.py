"""Независимая приёмка B6: полный жизненный цикл сделки на живом backend:8001.

Запуск: python3 _b6_verify.py  (из backend/)
"""
import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8001"
results: list[tuple[str, bool, str]] = []


def call(method: str, path: str, body: dict | None = None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


# 1. Companies: берём/создаём buyer и seller
st, companies = call("GET", "/companies")
assert st == 200, f"GET /companies -> {st}"
by_name = {c["name"]: c for c in companies}
seller = by_name.get("B6 Verify Seller") or call("POST", "/companies", {"name": "B6 Verify Seller"})[1]
buyer = by_name.get("B6 Verify Buyer") or call("POST", "/companies", {"name": "B6 Verify Buyer"})[1]
check("companies ready", bool(seller.get("id")) and bool(buyer.get("id")))

# 2. Листинг (валидная привязка к InvenTree part=1, как в B5)
st, listing = call(
    "POST",
    "/listings",
    {
        "title": "B6 verify display",
        "price_rub": 4900.0,
        "condition": "working",
        "inventree_part_id": 1,
        "seller_id": seller["id"],
    },
)
check("POST /listings -> 201", st == 201, f"got {st}")

# 3. Сделка
st, deal = call(
    "POST",
    "/deals",
    {
        "listing_id": listing["id"],
        "buyer_company_id": buyer["id"],
        "seller_company_id": seller["id"],
        "amount_rub": 4900.0,
    },
)
check("POST /deals -> 201", st == 201, f"got {st}")
check("deal status=created", deal.get("status") == "created", str(deal.get("status")))
check("escrow_status=created", deal.get("escrow_status") == "created", str(deal.get("escrow_status")))
deal_id = deal["id"]

# 4. Полный цикл переходов
cycle = [
    ("escrow_paid", "paid"),
    ("seller_confirmed", "in_progress"),
    ("shipped", "in_progress"),
    ("delivered", "in_progress"),
    ("buyer_confirmed", "in_progress"),
    ("payout", "released"),
    ("completed", "released"),
]
for to_status, escrow in cycle:
    st, resp = call("POST", f"/deals/{deal_id}/transition", {"to": to_status})
    ok = st == 200
    detail = f"got {st}"
    if ok:
        new_deal = resp.get("deal", resp)
        ok = new_deal.get("status") == to_status and new_deal.get("escrow_status") == escrow
        detail = f"status={new_deal.get('status')} escrow={new_deal.get('escrow_status')}"
    check(f"transition -> {to_status}", ok, detail)

# 5. Невалидные переходы -> 4xx
for frm, to in [("created", "completed"), ("completed", "created")]:
    st, resp = call("POST", f"/deals/{deal_id}/transition", {"to": to, "from_status": frm})
    detail_msg = str(resp.get("detail", ""))[:60]
    check(f"invalid {frm}->{to} -> 4xx", 400 <= st < 500, f"got {st} {detail_msg}")

# 6. История переходов
st, d = call("GET", f"/deals/{deal_id}")
tr = d.get("transitions") or []
check("transitions history >= 7", st == 200 and len(tr) >= 7, f"n={len(tr)}")

# 7. OpenAPI содержит новые эндпоинты
st, spec = call("GET", "/openapi.json")
paths = set(spec.get("paths", {}))
check(
    "openapi has POST /deals + /deals/{deal_id}/transition",
    "post" in spec.get("paths", {}).get("/deals", {})
    and "post" in spec.get("paths", {}).get("/deals/{deal_id}/transition", {}),
    "",
)

fails = [r for r in results if not r[1]]
print(f"\n{'ALL PASS' if not fails else 'FAILURES: ' + str(len(fails))} ({len(results)} checks)")
raise SystemExit(1 if fails else 0)
