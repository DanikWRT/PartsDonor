import json, urllib.request
lid = 'd2b6d0b1-496b-46f1-af7b-f0924c239f82'
try:
    with urllib.request.urlopen('http://127.0.0.1:8001/listings/' + lid, timeout=15) as r:
        d = json.loads(r.read().decode())
        print('listing status now:', d.get('status'))
        print('condition:', d.get('condition'), 'price:', d.get('price_rub'))
except Exception as e:
    print('ERR', repr(e))
