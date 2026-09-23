"""UX-2 live verify: подписка «Сообщить, когда появится» + статус Продано в catalog_detail."""
import asyncio
import json
import urllib.error
import urllib.request

from sqlalchemy import select

from app.db import async_session_factory as async_session
from app.models import Company, Listing, ListingStatus, User

BASE = "http://127.0.0.1:8001"
BUYER_EMAIL = "ux2sub.verify@gmail.com"
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


async def seed() -> dict:
    """Создать buyer-компанию+юзера и проданный листинг (direct DB)."""
    async with async_session() as db:
        user = (
            await db.execute(select(User).where(User.email == BUYER_EMAIL))
        ).scalar_one_or_none()
        if user is None:
            company = Company(name="UX2 Demo Buyer", role="buyer", slug=f"ux2-sub-{asyncio.get_event_loop().time():.0f}")
            db.add(company)
            await db.flush()
            from app.auth import hash_password
            user = User(
                email=BUYER_EMAIL,
                password_hash=hash_password(BUYER_PASS),
                role="buyer",
                company_id=company.id,
            )
            db.add(user)
        company = await db.get(Company, user.company_id)
        company.verified = True
        buyer_company_id = company.id

        # проданный листинг: берём существующий активный или создаём, затем sold
        listing = (
            await db.execute(
                select(Listing).where(Listing.status == ListingStatus.sold).limit(1)
            )
        ).scalar_one_or_none()
        if listing is None:
            base = (
                await db.execute(
                    select(Listing).where(Listing.status == ListingStatus.active, Listing.inventree_part_id.isnot(None)).limit(1)
                )
            ).scalar_one_or_none()
            assert base is not None, "нет активных листингов для seed"
            listing = Listing(
                inventree_part_id=base.inventree_part_id,
                inventree_stock_id=base.inventree_stock_id,
                seller_id=base.seller_id,
                title=base.title + " (sold)",
                price_rub=base.price_rub,
                condition=base.condition,
                provenance=base.provenance,
                status=ListingStatus.sold,
            )
            db.add(listing)
            await db.flush()
        await db.commit()
        return {
            "part_id": listing.inventree_part_id,
            "seller_user": None,
        }


seed_info = asyncio.run(seed())
PART = seed_info["part_id"]
print(f"seeded: part_id={PART}")

# --- a) POST /subscriptions -> 201 ---
tok, buyer_co = login(BUYER_EMAIL, BUYER_PASS)
check("login buyer", bool(tok and buyer_co), str(buyer_co))
s, sub = call("POST", "/subscriptions", {"inventree_part_id": PART}, tok)
check("POST /subscriptions 201", s == 201, f"status={s} {sub}")
check("sub echoed notified=false", sub.get("notified") is False and sub.get("inventree_part_id") == PART, str(sub))

# --- b) GET /subscriptions?part_id -> subscribed=true ---
s, st = call("GET", f"/subscriptions?part_id={PART}", token=tok)
check("GET /subscriptions subscribed=true", s == 200 and st.get("subscribed") is True, f"{s} {st}")

# --- c) GET /notifications -> empty ---
s, notes = call("GET", "/notifications", token=tok)
check("GET /notifications empty", s == 200 and notes == [], f"{s} {notes}")

# --- d) seller POST /listings for the same part -> 201 ---
SELLER_EMAIL = "ux2seller.verify@gmail.com"
SELLER_PASS = "seller123"
stok, sco = login(SELLER_EMAIL, SELLER_PASS)
if not stok:
    # регистрируем seller через API — он получает свою компанию автоматически
    s, r = call("POST", "/auth/register", {"email": SELLER_EMAIL, "password": SELLER_PASS, "role": "seller", "company_name": "UX2 Verify Seller"})
    stok, sco = login(SELLER_EMAIL, SELLER_PASS)
check("seller login", bool(stok), str(sco))
s, nl = call("POST", "/listings", {
    "title": f"UX2 verify listing part {PART}",
    "price_rub": 1500,
    "condition": "working",
    "provenance": "UX-2 live verify",
    "inventree_part_id": PART,
}, stok)
check("POST /listings 201 (new active)", s == 201, f"status={s} {str(nl)[:200]}")

# --- e) GET /notifications -> 1 item, notified flip ---
s, notes = call("GET", "/notifications", token=tok)
ok = s == 200 and len(notes) == 1 and notes[0].get("inventree_part_id") == PART \
    and notes[0].get("notified_at") and notes[0].get("part_name")
check("GET /notifications notified-flip after new listing", ok, f"{s} {notes}")

# --- f) GET /catalog/P -> sold + active statuses both present ---
s, det = call("GET", f"/catalog/{PART}")
statuses = sorted({l.get("status") for l in det.get("listings", [])})
check("catalog_detail exposes sold+active", s == 200 and "sold" in statuses and "active" in statuses,
      f"{s} statuses={statuses}")

# --- g) DELETE /subscriptions ---
s, d = call("DELETE", f"/subscriptions?part_id={PART}", token=tok)
check("DELETE /subscriptions ok", s == 200 and d.get("ok") is True, f"{s} {d}")

ok = all(x[1] for x in results)
print("UX2-VERIFY:", "ALL PASS" if ok else "SOME FAILED")
