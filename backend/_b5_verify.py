"""B5 verify: listing CRUD for the seller cabinet via the LIVE backend (HTTP :8001).

Acceptance for B5:
  - POST /listings   — создать объявление (часть + цена + состояние); привязка к
                       InvenTree part обязательна (валидация существования)
  - GET  /listings   — список листингов для кабинета (фильтр seller_id, статус)
  - PATCH /listings/{id} — изменить цену / статус (active|sold|hidden)
  - ответы несут part_name/part_category (разрешённые из InvenTree)

Требует живой backend (uvicorn :8001) + InvenTree (:8000) + PG (:5433).
"""
import json
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8001"
HEADERS = {"Content-Type": "application/json"}


def req(method: str, path: str, body=None):
    r = urllib.request.Request(
        BASE + path, method=method,
        headers=HEADERS,
        data=json.dumps(body).encode() if body is not None else None,
    )
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode() or "null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "null")
        except Exception:
            return e.code, None


def main() -> int:
    fails = []

    code, health = req("GET", "/health")
    print("health:", code, health)
    if code != 200:
        sys.exit("health failed — backend не на :8001, перезапусти uvicorn")

    # Возьмём реального продавца (кабинет) и реальный InvenTree part (pk=1 дисплей)
    _, companies = req("GET", "/companies")
    seller = next((c for c in companies if c.get("role") == "seller"), None)
    assert seller, "нет продавца в /companies"

    # 1) POST /listings — с реальным InvenTree part
    body = {
        "title": "B5 verify: дисплей iPhone 13 Pro",
        "price_rub": 12345.0,
        "condition": "untested",
        "provenance": "B5 curl verify",
        "inventree_part_id": 1,
        "seller_id": seller["id"],
    }
    code, created = req("POST", "/listings", body)
    print("\nPOST /listings (внешний part=1):", code)
    if code != 201:
        fails.append(f"POST /listings должен быть 201, пришло {code} {created}")
    else:
        lid = created["id"]
        print("  id=", lid, "part_name=", created.get("part_name"),
              "category=", created.get("part_category"), "status=", created.get("status"))
        if not created.get("part_name"):
            fails.append("POST /listings не вернул part_name (привязка к InvenTree part)")
        if created.get("status") != "active":
            fails.append("новый листинг должен быть active")

    # 2) POST /listings — НЕ существующий InvenTree part -> 400
    code, bad = req("POST", "/listings", {**body, "inventree_part_id": 999999,
                                          "title": "B5 bogus"})
    print("POST /listings bogus part=999999:", code, bad)
    if code != 400:
        fails.append("POST с несуществующим part должен быть 400")

    # 3) GET /listings?seller_id=... — только листинги этого продавца, с part_name
    code, mine = req("GET", f"/listings?seller_id={seller['id']}")
    print("\nGET /listings?seller_id: ", code, "count=", len(mine) if isinstance(mine, list) else mine)
    if code != 200 or not isinstance(mine, list):
        fails.append("GET /listings?seller_id должен вернуть список")
    else:
        with_part = sum(1 for l in mine if l.get("part_name"))
        print("  листингов с part_name:", with_part, "/", len(mine))
        if with_part != len(mine):
            fails.append("не все листинги продавца несут part_name")

    # фильтр по неизвестному продавцу -> пустой список
    code, other = req("GET", "/listings?seller_id=00000000-0000-0000-0000-000000000001")
    if code != 200 or (isinstance(other, list) and len(other) != 0):
        fails.append("seller_id неизвестного продавца должен давать []")

    # 4) PATCH /listings — цена + статус active -> sold
    code, patched = req("PATCH", f"/listings/{lid}", {"price_rub": 9999.0, "status": "sold"})
    print("\nPATCH /listings/{id} (цена+status=sold):", code)
    if code != 200:
        fails.append(f"PATCH должен быть 200, пришло {code}")
    else:
        print("  price=", patched.get("price_rub"), "status=", patched.get("status"))
        if patched.get("status") != "sold" or patched.get("price_rub") != 9999.0:
            fails.append("PATCH не применил цену/статус")

    # статус sold -> hidden (кабинет)
    code, patched2 = req("PATCH", f"/listings/{lid}", {"status": "hidden"})
    if code != 200 or patched2.get("status") != "hidden":
        fails.append("PATCH status=hidden не прошёл")

    # 5) GET /listings/{id} — карточка листинга с part_name
    code, one = req("GET", f"/listings/{lid}")
    print("GET /listings/{id}:", code, "part_name=", (one or {}).get("part_name"),
          "status=", (one or {}).get("status"))
    if code != 200 or not (one or {}).get("part_name"):
        fails.append("GET /listings/{id} не вернул part_name")

    # 6) откат: вернём статус active (чтобы не оставлять кабинет в sold) и удалим тестовый
    req("PATCH", f"/listings/{lid}", {"status": "hidden"})

    print("\n" + ("ALL PASS" if not fails else "FAILURES:\n" + "\n".join(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
