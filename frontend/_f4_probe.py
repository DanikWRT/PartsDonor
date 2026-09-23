import json, urllib.request

def get(path):
    with urllib.request.urlopen('http://127.0.0.1:8001' + path) as r:
        return json.load(r)

for p in ['/api/catalog', '/api/companies', '/api/deals', '/api/listings']:
    print('===', p, '===')
    try:
        d = get(p)
    except Exception as e:
        print('ERR', e)
        continue
    if isinstance(d, list):
        print('len', len(d))
        for row in d[:3]:
            print(json.dumps(row, ensure_ascii=False))
    else:
        print(json.dumps(d, ensure_ascii=False)[:500])
