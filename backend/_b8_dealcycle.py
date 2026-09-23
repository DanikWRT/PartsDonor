import sys, uuid, requests

BASE = "http://127.0.0.1:8001"
S = uuid.uuid4().hex[:6]

fails = []

def check(name, ok, det=""):
    print(("PASS" if ok else "FAIL") + ": " + name + (f" - {det}" if det else ""))
    if not ok:
        fails.append(name)

r = requests.post(f"{BASE}/auth/register", json={"email": f"q{S}@example.com", "password": "secret1", "role": "seller", "company_name": f"QShop{S}"})
check("reg seller", r.status_code == 201, str(r.status_code))
sid = r.json()["company_id"]
tok = requests.post(f"{BASE}/auth/login", json={"email": f"q{S}@example.com", "password": "secret1"}).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}

r = requests.post(f"{BASE}/listings", json={"title": f"Qdeal {S}", "price_rub": 3000.0, "inventree_part_id": 1}, headers=H)
check("listing 201", r.status_code == 201, str(r.status_code))
listing = r.json()

rb = requests.post(f"{BASE}/companies", json={"name": f"QBuyer{S}"}).json()
buyer_id = rb["id"]

r = requests.post(f"{BASE}/deals", json={"listing_id": listing["id"], "buyer_company_id": buyer_id, "amount_rub": 3000.0})
check("deal 201", r.status_code == 201, str(r.status_code))
deal = r.json()

# correct valid path per deal_machine.py
path = ["escrow_paid", "seller_confirmed", "shipped", "delivered", "buyer_confirmed", "payout", "completed"]
for to in path:
    r = requests.post(f"{BASE}/deals/{deal['id']}/transition", json={"to": to}, headers=H)
    check(f"transition {to}", r.status_code == 200 and r.json().get("to_status") == to, str(r.status_code))

# invalid transition now rejected
r = requests.post(f"{BASE}/deals/{deal['id']}/transition", json={"to": "refunded"}, headers=H)
check("refund from completed -> 4xx", r.status_code in (400, 422, 409), str(r.status_code))

r = requests.get(f"{BASE}/deals/{deal['id']}", headers=H)
check("final deal completed", r.json().get("status") == "completed", str(r.json().get("status")))
check("escrow released", r.json().get("escrow_status") == "released", str(r.json().get("escrow_status")))
check("transitions history", isinstance(r.json().get("transitions"), list) and len(r.json().get("transitions")) == 7)

print("\nFAILED:" if fails else "\nALL PASS", fails)
sys.exit(1 if fails else 0)
