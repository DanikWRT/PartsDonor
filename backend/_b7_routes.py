"""Confirm B7 openapi routes: reviews + rating present, yookassa absent."""
import json
import urllib.request

paths = json.load(urllib.request.urlopen("http://127.0.0.1:8001/openapi.json"))["paths"]
keys = sorted(paths.keys())
print("routes:")
for k in keys:
    print("  ", k)
print()
print("B7 routes present:", "/companies/{company_id}/rating" in keys, "| /reviews in keys:", "/reviews" in keys)
print("I2/YooKassa routes present (should be False):", any("yookassa" in k or "pay" in k or "webhooks" in k for k in keys))
