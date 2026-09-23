"""B8 verify — HTTP-тесты auth/RBAC против живого сервера (127.0.0.1:8001).

Запуск: .venv/bin/python backend/_b8_verify.py
Печатает PASS/FAIL по каждому чеку; exit != 0 при любой неудаче.
"""

from __future__ import annotations

import sys
import time
import uuid

import requests

BASE = "http://127.0.0.1:8001"
SUFFIX = uuid.uuid4().hex[:8]

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}: {name}" + (f" — {detail}" if detail else ""))


def main() -> int:
    buyer_email = f"buyer-{SUFFIX}@example.com"
    seller_email = f"seller-{SUFFIX}@example.com"

    # 1. register buyer -> 201
    r = requests.post(f"{BASE}/auth/register", json={"email": buyer_email, "password": "secret1", "role": "buyer"})
    check("register buyer -> 201", r.status_code == 201, f"got {r.status_code}")
    buyer_user = r.json() if r.status_code == 201 else {}

    # 2. register seller (+company) -> 201
    r = requests.post(
        f"{BASE}/auth/register",
        json={"email": seller_email, "password": "secret1", "role": "seller", "company_name": f"TestShop {SUFFIX}"},
    )
    check("register seller -> 201", r.status_code == 201, f"got {r.status_code}")
    seller_user = r.json() if r.status_code == 201 else {}
    check("seller got company_id", seller_user.get("company_id") is not None)

    # 3. login -> token
    r = requests.post(f"{BASE}/auth/login", json={"email": buyer_email, "password": "secret1"})
    ok = r.status_code == 200 and bool(r.json().get("access_token"))
    check("login buyer -> token", ok, f"got {r.status_code}")
    buyer_token = r.json().get("access_token", "") if ok else ""

    r = requests.post(f"{BASE}/auth/login", json={"email": seller_email, "password": "secret1"})
    seller_token = r.json().get("access_token", "") if r.status_code == 200 else ""
    check("login seller -> token", bool(seller_token))

    # 4. duplicate email -> 409/400
    r = requests.post(f"{BASE}/auth/register", json={"email": buyer_email, "password": "x12345", "role": "buyer"})
    check("duplicate email -> 409/400", r.status_code in (400, 409), f"got {r.status_code}")

    # 5. wrong password -> 401
    r = requests.post(f"{BASE}/auth/login", json={"email": buyer_email, "password": "wrongpass"})
    check("wrong password -> 401", r.status_code == 401, f"got {r.status_code}")

    # admin token: логинимся под seed-админом
    r = requests.post(f"{BASE}/auth/login", json={"email": "admin@partsdonor.example.com", "password": "admin123"})
    admin_token = r.json().get("access_token", "") if r.status_code == 200 else ""
    check("admin login -> token", bool(admin_token))

    # 6. /admin/users with admin token -> 200
    r = requests.get(f"{BASE}/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    check("GET /admin/users admin -> 200", r.status_code == 200, f"got {r.status_code}")

    # 7. /admin/users with buyer token -> 403
    r = requests.get(f"{BASE}/admin/users", headers={"Authorization": f"Bearer {buyer_token}"})
    check("GET /admin/users buyer -> 403", r.status_code == 403, f"got {r.status_code}")

    # 8. create_listing без токена -> 401
    r = requests.post(f"{BASE}/listings", json={"title": "x", "price_rub": 100})
    check("create_listing no token -> 401", r.status_code == 401, f"got {r.status_code}")

    # 9. create_listing с мусорным токеном -> 401
    r = requests.post(
        f"{BASE}/listings", json={"title": "x", "price_rub": 100},
        headers={"Authorization": "Bearer garbage.token.here"},
    )
    check("create_listing invalid token -> 401", r.status_code == 401, f"got {r.status_code}")

    # 10. create_listing buyer token -> 403 (wrong role)
    r = requests.post(
        f"{BASE}/listings", json={"title": "x", "price_rub": 100},
        headers={"Authorization": f"Bearer {buyer_token}"},
    )
    check("create_listing buyer -> 403", r.status_code == 403, f"got {r.status_code}")

    # 11. create_listing seller token -> 2xx (InvenTree-валидация может дать 400 —
    #     но только по part_id, не по auth; без part_id должно быть 201)
    r = requests.post(
        f"{BASE}/listings",
        json={"title": f"B8 part {SUFFIX}", "price_rub": 1500.0},
        headers={"Authorization": f"Bearer {seller_token}"},
    )
    check("create_listing seller -> 2xx", 200 <= r.status_code < 300, f"got {r.status_code}")
    listing = r.json() if 200 <= r.status_code < 300 else {}
    check("listing bound to seller company", listing.get("seller_id") == seller_user.get("company_id"))

    # 12. чужой seller не может патчить листинг -> 403 (ownership)
    other_email = f"seller2-{SUFFIX}@example.com"
    r = requests.post(
        f"{BASE}/auth/register",
        json={"email": other_email, "password": "secret1", "role": "seller", "company_name": f"OtherShop {SUFFIX}"},
    )
    other_token = ""
    if r.status_code == 201:
        other_token = requests.post(
            f"{BASE}/auth/login", json={"email": other_email, "password": "secret1"}
        ).json().get("access_token", "")
    if listing and other_token:
        r = requests.patch(
            f"{BASE}/listings/{listing['id']}", json={"price_rub": 1},
            headers={"Authorization": f"Bearer {other_token}"},
        )
        check("update_listing other seller -> 403", r.status_code == 403, f"got {r.status_code}")
        r = requests.patch(
            f"{BASE}/listings/{listing['id']}", json={"price_rub": 1600.0},
            headers={"Authorization": f"Bearer {seller_token}"},
        )
        check("update_listing owner -> 2xx", 200 <= r.status_code < 300, f"got {r.status_code}")
    else:
        check("update_listing ownership checks", False, "нет листинга/токена")

    # 13. deals: transition/pay требуют токена -> 401
    fake_deal = str(uuid.uuid4())
    r = requests.post(f"{BASE}/deals/{fake_deal}/transition", json={"to": "escrow_paid"})
    check("transition no token -> 401", r.status_code == 401, f"got {r.status_code}")
    r = requests.post(f"{BASE}/deals/{fake_deal}/pay", json={"return_url": "http://x"})
    check("deal_pay no token -> 401", r.status_code == 401, f"got {r.status_code}")

    # 14. buyer token на transition -> 401 через auth-гейт? нет: buyer допускается по роли,
    #     но чужая сделка -> 403 (или 404, если сделки нет — проверяем 403 на несуществующей
    #     не выйдет; достаточно что гейт авторизации отработал в п.13)
    # 15. POST /auth/register admin -> 403
    r = requests.post(f"{BASE}/auth/register", json={"email": f"adm-{SUFFIX}@example.com", "password": "secret1", "role": "admin"})
    check("register admin -> 403", r.status_code == 403, f"got {r.status_code}")

    # 16. старые эндпоинты живы (B4-B7 не сломаны)
    r = requests.get(f"{BASE}/health")
    check("GET /health still 200", r.status_code == 200, f"got {r.status_code}")
    r = requests.get(f"{BASE}/listings")
    check("GET /listings still 200", r.status_code == 200, f"got {r.status_code}")
    r = requests.get(f"{BASE}/companies")
    check("GET /companies still 200", r.status_code == 200, f"got {r.status_code}")

    failed = [n for n, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("FAILED:", ", ".join(failed))
        return 1
    print("ALL PASS")
    return 0


if __name__ == "__main__":
    time.sleep(0.1)
    sys.exit(main())
