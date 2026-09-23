import json, sys, urllib.request

for port in (8001, 8101):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/openapi.json", timeout=5) as r:
            d = json.load(r)
        print(f"port {port}: title={d.get('info',{}).get('title')}, paths={sorted(d['paths'].keys())}")
    except Exception as e:
        print(f"port {port}: ERROR {e}")
