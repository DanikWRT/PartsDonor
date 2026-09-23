import json, urllib.request
for u in ["http://127.0.0.1:5173/api/donor/6", "http://127.0.0.1:5173/api/device-schemas"]:
    print("====", u)
    d = json.load(urllib.request.urlopen(u, timeout=20))
    print(json.dumps(d, ensure_ascii=False, indent=1)[:2500])
