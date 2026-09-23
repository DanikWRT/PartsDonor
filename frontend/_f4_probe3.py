import json, urllib.request

with urllib.request.urlopen('http://127.0.0.1:8001/openapi.json', timeout=5) as r:
    spec = json.load(r)

for path, methods in spec['paths'].items():
    for m in methods:
        print(m.upper().ljust(6), path)
