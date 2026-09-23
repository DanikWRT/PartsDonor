"""PartsDonor state probe (dev helper). Verifies InvenTree + backend + postgres."""
import json
import httpx

from app.config import settings

base = settings.inventree_base_url
tok = settings.inventree_token

print("== settings ==")
print(f"database_url={settings.database_url}")
print(f"inventree_base_url={base}")
print(f"inventree_token=set:{bool(tok)} (len {len(tok)})")

headers = {"Authorization": f"Token {tok}"}

print("\n== InvenTree /health-like ==")
try:
    r = httpx.get(base, headers=headers, timeout=8)
    print(f"GET {base} -> {r.status_code}")
except Exception as e:
    print(f"InvenTree unreachable: {e!r}")

print("\n== InvenTree /api/part/ ==")
try:
    r = httpx.get(f"{base}/api/part/", headers=headers, params={"limit": 50}, timeout=10)
    print(f"GET part -> {r.status_code}")
    data = r.json()
    results = data.get("results", data) if isinstance(data, dict) else data
    print(json.dumps([(p.get("pk"), p.get("name")) for p in results], ensure_ascii=False))
except Exception as e:
    print(f"part list failed: {e!r}")

print("\n== InvenTree /api/company/ ==")
try:
    r = httpx.get(f"{base}/api/company/", headers=headers, params={"limit": 20}, timeout=10)
    print(f"GET company -> {r.status_code}, body head: {r.text[:200]}")
except Exception as e:
    print(f"company list failed: {e!r}")
