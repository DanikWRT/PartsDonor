import json, urllib.request, uuid

BASE = 'http://127.0.0.1:8001'
SUFFIX = uuid.uuid4().hex[:8]

def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, str(e)

email = f'seller-f7-{SUFFIX}@example.com'
# register seller
s, reg = call('POST', '/auth/register', {'email': email, 'password': 'secret1', 'role': 'seller', 'company_name': f'F7Shop {SUFFIX}'})
print('register:', s)
print('reg body:', json.dumps(reg, ensure_ascii=False)[:500])
company_id = reg.get('company_id')
# login
s2, tok = call('POST', '/auth/login', {'email': email, 'password': 'secret1'})
print('login:', s2, 'token_len:', len(tok.get('access_token','')))
token = tok.get('access_token','')
# create a listing owned by this seller for donor part 1 (display)
s3, listing = call('POST', '/listings', {
    'seller_id': str(company_id),
    'inventree_part_id': 1,
    'title': f'F7 Display {SUFFIX}',
    'price_rub': 4200,
    'condition': 'untested',
    'provenance': 'донор',
    'status': 'active',
}, token=token)
print('create listing:', s3)
print('listing:', json.dumps(listing, ensure_ascii=False)[:600])
print('LISTING_ID=' + str(listing.get('id')))
print('EMAIL=' + email)
print('TOKEN=' + token)
