import json

with open("/tmp/openapi.json") as f:
    d = json.load(f)
paths = sorted(d["paths"].keys())
print("ALL ROUTES:")
for p in paths:
    methods = ",".join(sorted(m.upper() for m in d["paths"][p] if m in ("get","post","patch","put","delete")))
    print(f"  {methods:10} {p}")
