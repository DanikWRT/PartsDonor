#!/usr/bin/env python3
"""F5 live-check: drive a created deal through the escrow machine via admin token
and read back each step to confirm the backend sequence used by the Deal screen."""
import json, sys, time, urllib.request, urllib.error

BASE = "http://127.0.0.1:8001"


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

# 1. admin login
def get(path):
    with urllib.request.urlopen(BASE + path) as r:
        return json.load(r)

deals = get("/deals")
target = next((d for d in deals if d["status"] == "created"), None)
if not target:
    print("NO created deal to drive; using existing deal read-only")
    sys.exit(2)
did = target["id"]
print(f"target deal: {did}")

st, login = req("POST", "/auth/login",
                {"email": "admin@partsdonor.example.com", "password": "admin123"})
tok = login.get("access_token") if st == 200 else ""
print(f"admin login -> {st}, tok={bool(tok)}")
if not tok:
    print("admin login failed:", login)
    sys.exit(1)

# Walk the main path created->escrow_paid->seller_confirmed->shipped->delivered->buyer_confirmed->payout->completed
path = ["escrow_paid", "seller_confirmed", "shipped", "delivered", "buyer_confirmed", "payout", "completed"]
cur = "created"
for to in path:
    st, body = req("POST", f"/deals/{did}/transition",
                   {"to": to, "from_status": cur}, token=tok)
    ok = st == 200
    escr = body.get("deal", {}).get("escrow_status") if isinstance(body, dict) else None
    print(f"transition {cur}->{to}: HTTP {st}, escrow={escr}, ok={ok}")
    if not ok:
        print("  body:", body)
        break
    cur = to

# read back final deal
def get(path):
    with urllib.request.urlopen(BASE + path) as r:
        return json.load(r)
final = get(f"/deals/{did}")
print("final status:", final["status"], "escrow:", final["escrow_status"])
print("transitions:", len(final.get("transitions") or []))
