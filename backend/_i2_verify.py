"""Независимая приёмка I2: ЮKassa Безопасная сделка — платёж на холд + вебхук.

Запуск: python3 _i2_verify.py  (из backend/)

Доказывает acceptance:
  1. POST /deals/{id}/pay создаёт платёж ЮKassa (тестовый режим) и сохраняет
     yookassa_payment_id;
  2. вебхук payment.succeeded с ВЕРНОЙ HMAC-подписью меняет статус сделки
     created -> escrow_paid и escrow_status created -> paid;
  3. вебхук с НЕВЕРНОЙ подписью отклоняется (400),
     вебхук без подписи отклоняется (400).
"""
import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8001"
SECRET = "i2-test-secret-0123456789abcdef"  # совпадает с PARTSDONOR_YOOKASSA_NOTIFICATION_SECRET
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
    """HMAC-SHA256 (base64) по тому же байтовому телу, что уходит в запрос.

    urllib шлёт json.dumps(body) с сепараторами по умолчанию — подписываем ровно
    эти байты, т.к. сервер вычисляет HMAC по сырому телу запроса.
    """
    raw = json.dumps(body).encode()
    sig = base64.b64encode(hmac.new(SECRET.encode(), raw, hashlib.sha256).digest()).decode()
    return sig


# 1. Компании + листинг
st, companies = call("GET", "/companies")
by_name = {c["name"]: c for c in companies}
seller = by_name.get("I2 Verify Seller") or call("POST", "/companies", {"name": "I2 Verify Seller"})[1]
buyer = by_name.get("I2 Verify Buyer") or call("POST", "/companies", {"name": "I2 Verify Buyer"})[1]
check("seller/buyer companies ready", bool(seller.get("id")) and bool(buyer.get("id")))

# 2. Листинг
st, listing = call(
    "POST", "/listings",
    {"title": "I2 verify display", "price_rub": 7900.0, "condition": "working",
     "inventree_part_id": 1, "seller_id": seller["id"]},
)
check("POST /listings -> 201", st == 201, f"got {st}")

# 3. Сделка (created / escrow created)
st, deal = call(
    "POST", "/deals",
    {"listing_id": listing["id"], "buyer_company_id": buyer["id"],
     "seller_company_id": seller["id"], "amount_rub": 7900.0},
)
check("POST /deals -> 201", st == 201, f"got {st}")
check("deal status=created", deal.get("status") == "created", str(deal.get("status")))
check("escrow_status=created", deal.get("escrow_status") == "created", str(deal.get("escrow_status")))
deal_id = deal["id"]

# 4. POST /deals/{id}/pay — платёж на холд
st, pay = call("POST", f"/deals/{deal_id}/pay", {"return_url": "https://partsdonor.test/pay/ok"})
check("POST /deals/{id}/pay -> 201", st == 201, f"got {st}")
check("payment has id", bool(pay.get("payment_id")), str(pay.get("payment_id")))
check("payment test=true", pay.get("test") is True, str(pay.get("test")))
payment_id = pay["payment_id"]

# 5. Deal сохранил yookassa_payment_id
st, d1 = call("GET", f"/deals/{deal_id}")
check("deal.yookassa_payment_id set", d1.get("yookassa_payment_id") == payment_id, str(d1.get("yookassa_payment_id")))

# 6. Вебхук payment.succeeded с ВЕРНОЙ подписью -> escrow_paid / escrow paid
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
wrong_sig = sign({**wh_body, "event": "payment.canceled"})  # подпись НЕ соответствует телу
st, bad = call("POST", "/webhooks/yookassa", wh_body, {"X-Signature": wrong_sig})
check("webhook wrong sig -> 400", st == 400, f"got {st} {str(bad.get('detail'))[:40]}")

# 9. Безопасность: без подписи -> 400
st, nosig = call("POST", "/webhooks/yookassa", wh_body)
check("webhook no sig -> 400", st == 400, f"got {st} {str(nosig.get('detail'))[:40]}")

# 10. Идемпотентность: повторный вебхук не ломает статус (сделка уже escrow_paid)
st, wh2 = call("POST", "/webhooks/yookassa", wh_body, {"X-Signature": sig})
st, d3 = call("GET", f"/deals/{deal_id}")
check("repeat webhook idempotent (status stays escrow_paid)", d3.get("status") == "escrow_paid", str(d3.get("status")))

fails = [r for r in results if not r[1]]
print(f"\n{'ALL PASS' if not fails else 'FAILURES: ' + str(len(fails))} ({len(results)} checks)")
raise SystemExit(1 if fails else 0)
