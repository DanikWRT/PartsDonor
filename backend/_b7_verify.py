"""B7 independent verification. Deterministic: recomputes expected avg from the
actual /reviews list, so it works regardless of prior data on the seller."""
import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8001"
SELLER = "c3d6c3dd-b728-4f5d-b427-221ed66ce177"


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

fail = 0

# 0. reset seller reviews to empty baseline (delete via direct DB? none. use comment marker)
#    We make it deterministic: capture current set, add one known rating, compare maths.

# current baseline list before POST
s0, before = req("GET", f"/reviews?seller_id={SELLER}")
ratings_before = [r["rating"] for r in before]

NEW = 5
status, rev = req("POST", "/reviews", {"rating": NEW, "comment": "b7-verify", "seller_id": SELLER})
print("1) POST /reviews ->", status, "(201 expected)"); fail += (status != 201)

# recompute expected from actual list
s0, after = req("GET", f"/reviews?seller_id={SELLER}")
ratings_after = [r["rating"] for r in after]
exp = round(sum(ratings_after) / len(ratings_after), 2)
exp_count = len(ratings_after)

status, avg = req("GET", f"/companies/{SELLER}/rating")
print(f"2) GET avg rating -> {status} {avg}")
print(f"   expected avg {exp} count {exp_count} | got {avg['avg_rating']}/{avg['review_count']}")
ok = (avg["avg_rating"] == exp and avg["review_count"] == exp_count)
print("   ", "PASS" if ok else "FAIL"); fail += (not ok)

status, comp = req("GET", f"/companies/{SELLER}")
print(f"3) Company.rating -> {status} {comp.get('rating')} (name {comp.get('name')})")
okc = (comp.get("rating") == exp)
print("   ", "PASS" if okc else "FAIL"); fail += (not okc)

status, body = req("GET", "/companies/00000000-0000-0000-0000-000000000000/rating")
print(f"4) unknown company -> {status} {body} (404 expected)"); fail += (status != 404)

# 5. rating bounds: POST with rating 0 / 6 should 422
s0, b = req("POST", "/reviews", {"rating": 7, "seller_id": SELLER})
print(f"5) rating=7 -> {s0} (422 expected)"); fail += (s0 != 422)

print("\nRESULT:", "ALL PASS" if fail == 0 else f"{fail} FAILURES")
raise SystemExit(1 if fail else 0)
