"""Приёмка I2 (актуальная, с учётом B8 auth): ЮKassa платёж на холд + вебхук.

B8 (JWT RBAC) поставил auth: POST /listings требует seller с привязанной
компанией, /deals/{id}/pay требует buyer/admin. I2-код (yookassa_client, /pay,
/webhooks/yookassa) не менялся; здесь доказываем acceptance на живом backend:
  - seller-JWT (с мастерской) создаёт листинг;
  - POST /deals (без auth) создаёт сделку;
  - admin-JWT платит (passes buyer/admin);
  - вебхук аутентифицируется ТОЛЬКО HMAC (не JWT) и двигает статус.

Запуск: python3 _i2_verify_auth.py  (из backend/)
"""
import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8001"
SECRET = "i2-test-secret-0123456789abcdef"  # PARTSDONOR_YOOKASSA_NOTIFICATION_SECRET
ADMIN_EMAIL = "admin@partsdonor.example.com"
ADMIN_PASS = "admin123"
SELLER_EMAIL = "i2seller.verify@gmail.com"
SELLER_PASS = "seller123"
results: list[tuple[str, bool, str]] = []


def call(method: str, path: str, body: dict | None = None, headers: dict | None = None):
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
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


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def sign(body: dict) -> str:
    raw = json.dumps(body).encode()
    sig = base64.b64encode(hmac.new(SECRET.encode(), raw, hashlib.sha256).digest()).decode()
    return sig


def bh(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def login(email, password):
    st, r = call("POST", "/auth/login", {"email": email, "password": password})
    return st, r


# 0. Селлер (с мастерской) + админ JWT
st, sreg = call("POST", "/auth/register",
                {"email": SELLER_EMAIL, "password": SELLER_PASS, "role": "seller",
                 "company_name": "I2 Verify Seller"})
if st not in (201, 409):  # 409 = уже есть
    check("seller register", False, f"got {st} {sreg}")
st_s, stok = login(SELLER_EMAIL, SELLER_PASS)
check("seller login -> 200", st_s == 200, f"got {st_s}")
seller_token = stok.get("access_token") or ""
st_a, atok = login(ADMIN_EMAIL, ADMIN_PASS)
check("admin login -> 200", st_a == 200, f"got {st_a}")
admin_token = atok.get("access_token") or ""

# 1. Компания селлера и buyer-компания
# (company_id не возвращается из /auth/login — берём его из seller_id листинга, который
#  сервер привязывает из user.company_id, см. create_listing: см. ниже после создания листинга)
st, companies = call("GET", "/companies")
by_name = {c["name"]: c for c in companies}
buyer = by_name.get("I2 Verify Buyer") or call("POST", "/companies", {"name": "I2 Verify Buyer"})[1]
buyer_company_id = buyer.get("id")
check("buyer company ready", bool(buyer_company_id), str(buyer_company_id))

# 2. Листинг от селлера (seller_id привязывается из user.company_id)
st, listing = call(
    "POST", "/listings",
    {"title": "I2 verify display", "price_rub": 7900.0, "condition": "working",
     "inventree_part_id": 1},
    headers=bh(seller_token),
)
check("POST /listings -> 201 (seller auth)", st == 201,
      f"got {st} {str(listing.get('detail'))[:60] if st != 201 else ''}")
listing_id = listing.get("id")
seller_company_id = listing.get("seller_id")
check("seller has company (listing.seller_id = user.company_id)",
      bool(seller_company_id), str(seller_company_id))

# 3. Сделка (без auth)
st, deal = call(
    "POST", "/deals",
    {"listing_id": listing_id, "buyer_company_id": buyer_company_id,
     "seller_company_id": seller_company_id, "amount_rub": 7900.0},
)
check("POST /deals -> 201", st == 201, f"got {st}")
check("deal status=created", deal.get("status") == "created", str(deal.get("status")))
check("escrow_status=created", deal.get("escrow_status") == "created", str(deal.get("escrow_status")))
deal_id = deal["id"]

# 4. POST /deals/{id}/pay — платёж на холд (admin passes buyer/admin)
st, pay = call("POST", f"/deals/{deal_id}/pay",
               {"return_url": "https://partsdonor.test/pay/ok"}, headers=bh(admin_token))
check("POST /deals/{id}/pay -> 201", st == 201,
      f"got {st} {str(pay.get('detail'))[:60] if st != 201 else ''}")
check("payment has id", bool(pay.get("payment_id")), str(pay.get("payment_id")))
check("payment test=true", pay.get("test") is True, str(pay.get("test")))
payment_id = pay["payment_id"]

# 5. Deal сохранил yookassa_payment_id
st, d1 = call("GET", f"/deals/{deal_id}")
check("deal.yookassa_payment_id set", d1.get("yookassa_payment_id") == payment_id, str(d1.get("yookassa_payment_id")))

# 6. Вебхук payment.succeeded с ВЕРНОЙ подписью (ТОЛЬКО HMAC, без JWT)
wh_body = {
    "type": "notification",
    "event": "payment.succeeded",
    "object": {"id": payment_id, "status": "succeeded", "paid": True,
               "amount": {"value": "7900.00", "currency": "RUB"}, "test": True},
}
sig = sign(wh_body)
st, wh = call("POST", "/webhooks/yookassa", wh_body, {"X-Signature": sig})
check("webhook valid sig -> 200", st == 200, f"got {st}")
check("webhook processed=true", wh.get("processed") is True, str(wh.get("processed")))
check("webhook event=payment.succeeded", wh.get("event") == "payment.succeeded", str(wh.get("event")))

# 7. Статус сделки после вебхука
st, d2 = call("GET", f"/deals/{deal_id}")
check("deal status -> escrow_paid", d2.get("status") == "escrow_paid", str(d2.get("status")))
check("escrow_status -> paid", d2.get("escrow_status") == "paid", str(d2.get("escrow_status")))
check("transition recorded source=yookassa", any(
    t.get("source") == "yookassa_webhook" for t in (d2.get("transitions") or [])), "")

# 8. Безопасность: НЕВЕРНАЯ подпись -> 400
wrong_sig = sign({**wh_body, "event": "payment.canceled"})
st, bad = call("POST", "/webhooks/yookassa", wh_body, {"X-Signature": wrong_sig})
check("webhook wrong sig -> 400", st == 400, f"got {st} {str(bad.get('detail'))[:40]}")

# 9. Безопасность: без подписи -> 400
st, nosig = call("POST", "/webhooks/yookassa", wh_body)
check("webhook no sig -> 400", st == 400, f"got {st} {str(nosig.get('detail'))[:40]}")

# 10. Идемпотентность
call("POST", "/webhooks/yookassa", wh_body, {"X-Signature": sig})
st, d3 = call("GET", f"/deals/{deal_id}")
check("repeat webhook idempotent (status stays escrow_paid)", d3.get("status") == "escrow_paid", str(d3.get("status")))

fails = [r for r in results if not r[1]]
print(f"\n{'ALL PASS' if not fails else 'FAILURES: ' + str(len(fails))} ({len(results)} checks)")
raise SystemExit(1 if fails else 0)
