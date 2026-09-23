import json, urllib.request
for p in ["/health","/catalog?search=iPhone"]:
    with urllib.request.urlopen("http://127.0.0.1:8001"+p, timeout=8) as r:
        d=json.load(r)
    if p=="/catalog?search=iPhone":
        row=d[0] if d else {}
        print("catalog row keys:", sorted(row.keys()))
        print("catalog model:", row.get("name"))
    else:
        print(p, d)
