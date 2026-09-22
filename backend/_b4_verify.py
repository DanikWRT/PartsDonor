"""B4 verify: catalog search by brand/model/type + warranty via the live backend (HTTP).

Runs against the running FastAPI app (uvicorn on :8001) OR, if that's stale,
against the app's own InvenTree client + DB logic. We call the live HTTP server;
requires the backend to be restarted after code changes.
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8001"


def get(path: str) -> tuple[int, any]:
    req = urllib.request.Request(BASE + path)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def main() -> int:
    fails = []

    # 1) /health — backend up
    code, body = get("/health")
    print("health:", code, body)
    if code != 200:
        sys.exit("health failed — backend не отвечает, перезапусти uvicorn на :8001")

    # 2) GET /catalog?brand=Apple&model=iPhone 13 Pro — должны прийти части донора+BOM
    code, body = get("/catalog?brand=" + urllib.parse.quote("Apple") +
                     "&model=" + urllib.parse.quote("iPhone 13 Pro"))
    print("\ncatalog brand=Apple&model=iPhone13Pro:", code, "items=", len(body) if isinstance(body, list) else body)
    if code != 200 or not isinstance(body, list) or len(body) == 0:
        fails.append(f"brand/model: code={code} items not a non-empty list")
    else:
        ids = [it["id"] for it in body]
        print("  part ids:", sorted(ids))
        # ожидаем донор(6) + 5 BOM-компонентов (1..5)
        if not ({1, 2, 3, 4, 5, 6} <= set(ids)):
            fails.append(f"brand/model должен включать донора 6 + BOM 1..5, пришло {sorted(ids)}")
        # каждая запись несёт цену/рейтинг/гарантию у тех, у кого есть active listing
        for it in body:
            print("   ", it["id"], it["name"], "price=", it["listing_price"],
                  "cond=", it["listing_condition"], "warranty=", it["listing_warranty"],
                  "seller=", it["seller_name"], "rating=", it["seller_rating"])
    has_warranty_key = any("listing_warranty" in it and "seller_rating" in it for it in (body if isinstance(body, list) else []))


    # 3) GET /catalog?model=iPhone — подстрока модели
    code, body = get("/catalog?model=" + urllib.parse.quote("iPhone"))
    print("\ncatalog model=iPhone:", code, "items=", len(body) if isinstance(body, list) else body)
    if code != 200 or not isinstance(body, list) or len(body) == 0:
        fails.append("model=iPhone: должен находить схему с model 'iPhone 13 Pro'")

    # 4) GET /catalog?brand=NotFound — пусто (нет такой схемы)
    code, body = get("/catalog?brand=" + urllib.parse.quote("Samsung"))
    print("\ncatalog brand=Samsung (нет схемы):", code, "items=", len(body) if isinstance(body, list) else body)
    if code != 200 or not isinstance(body, list) or len(body) != 0:
        fails.append("brand=Samsung должен давать пустой каталог (схемы нет)")

    # 5) Поиск по типу (категории) — category_name=дисплей|Ди (Дисплеи)
    code, body = get("/catalog?category_name=" + urllib.parse.quote("Диспле"))
    print("\ncatalog category_name=Диспле:", code, "items=", len(body) if isinstance(body, list) else body)
    if code != 200 or not isinstance(body, list) or len(body) != 1:
        fails.append(f"category_name='Диспле' должен вернуть 1 деталь (Дисплей), пришло {len(body) if isinstance(body,list) else body}")

    # 6) Карточка детали: /catalog/1 — предложения продавцов с гарантией
    code, body = get("/catalog/1")
    print("\ncatalog/1:", code)
    if code != 200 or not isinstance(body, dict):
        fails.append("catalog/1: не вернул карточку")
    else:
        print("  name=", body.get("name"), "listings=", len(body.get("listings", [])))
        for l in body.get("listings", []):
            print("   ", l.get("price_rub"), l.get("condition"), "warranty=", l.get("warranty"),
                  "seller=", l.get("seller_name"), "rating=", l.get("seller_rating"))

    # 7) Поля гарантии/рейтинга присутствуют в схеме ответа
    if not has_warranty_key:
        fails.append("в ответах отсутствует поле listing_warranty")

    print("\n" + ("ALL PASS" if not fails else "FAILURES:\n" + "\n".join(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
