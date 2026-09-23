#!/usr/bin/env python3
"""Drive a fresh created deal to `delivered` to demo the confirm-window countdown timer."""
import json, sys, urllib.request, urllib.error

BASE = "http://127.0.0.1:8001"

def get(path):
    with urllib.request.urlopen(BASE + path) as r:
        return json.load(r)

def req(method, path, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.load(resp)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

st, login = req("POST", "/auth/login",
                {"email": "admin@partsdonor.example.com", "password": "admin123"})
tok = login.get("access_token")

# pick a created deal (prefer one with low amount / demo)
deals = get("/deals")
cands = [d for d in deals if d["status"] == "created"]
if not cands:
    print("no created deal available")
    sys.exit(2)
target = cands[-1]
did = target["id"]
print("target:", did, target.get("amount_rub"))

for to in ["escrow_paid", "seller_confirmed", "shipped", "delivered"]:
    st, body = req("POST", f"/deals/{did}/transition",
                   {"to": to, "from_status": target["status"]}, token=tok)
    # after first, from_status updates
    if st != 200:
        print("fail", to, st, body)
        sys.exit(1)
    target = body["deal"]
    print(f"{target['status']} escrow={target['escrow_status']}")

print("FINAL_DELIVERED_DEAL", did)
