import json, urllib.request

for p in ['/', '/health', '/api', '/openapi.json', '/docs']:
    print('===', p, '===')
    try:
        with urllib.request.urlopen('http://127.0.0.1:8001' + p, timeout=5) as r:
            data = r.read().decode()
            print('status', r.status, 'len', len(data))
            print(data[:300])
    except Exception as e:
        print('ERR', e)
    print()
