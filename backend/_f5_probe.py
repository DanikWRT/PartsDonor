#!/usr/bin/env python3
import json, urllib.request

BASE = "http://127.0.0.1:8001/api"

def get(path):
    with urllib.request.urlopen(BASE + path) as r:
        return json.load(r)

print("=== COMPANIES ===")
for c in get("/companies"):
    print(c.get("id"), c.get("role"), c.get("name"))

print("\n=== DEALS (full first 3) ===")
for d in get("/deals")[:3]:
    print(json.dumps(d, ensure_ascii=False, indent=2, default=str))

print("\n=== LISTINGS (first 5) ===")
for l in get("/listings")[:5]:
    print(l.get("id"), l.get("title"), l.get("price_rub"), l.get("condition"))
