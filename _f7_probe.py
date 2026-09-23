import json, urllib.request

def get(path):
    try:
        req = urllib.request.Request('http://127.0.0.1:8001' + path)
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read().decode())
    except Exception as e:
        return None, str(e)

s, d = get('/donor/6')
print('donor/6:', s)
print(json.dumps(d, ensure_ascii=False, indent=2)[:3000])
