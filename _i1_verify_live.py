import json, urllib.request, urllib.error, random, string

BASE = 'http://127.0.0.1:8001'

def req(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header('Content-Type', 'application/json')
    if token:
        r.add_header('Authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

suf = ''.join(random.choices(string.ascii_lowercase, k=6))
sell = f'seller_i1_{suf}@demo.ru'
buy = f'buyer_i1_{suf}@demo.ru'
ok = True
def check(name, cond):
    global ok
    print(('PASS' if cond else 'FAIL') + '  ' + name)
    if not cond: ok = False

# 1. register seller
code, d = req('POST', '/auth/register', {'email': sell, 'password': 'secret123', 'role': 'seller', 'company_name': f'Shop {suf}'})
check(f'register seller {code}', code == 201 and d.get('company_id'))
seller_comp = d.get('company_id')
code, d = req('POST', '/auth/login', {'email': sell, 'password': 'secret123'})
check(f'login seller 200 (company_id in token)', code == 200 and d.get('company_id') == seller_comp)
seller_tok = d.get('access_token')

# 2. register buyer -> own company (fix B)
code, d = req('POST', '/auth/register', {'email': buy, 'password': 'secret123', 'role': 'buyer'})
check(f'register buyer {code} has company (fix B)', code == 201 and d.get('company_id'))
buyer_comp = d.get('company_id')
code, d = req('POST', '/auth/login', {'email': buy, 'password': 'secret123'})
check(f'login buyer 200; company_id matches own', code == 200 and d.get('company_id') == buyer_comp)
buyer_tok = d.get('access_token')

# 3. seller creates listing (WRITE needs JWT — fix A)
code, d = req('POST', '/listings', {'title': f'I1 live e2e {suf}', 'price_rub': 1234, 'condition': 'working', 'provenance': ''}, seller_tok)
check(f'seller creates listing {code}', code == 201 and d.get('id'))
listing_id = d.get('id')

# 4. buyer finds via catalog (GET public)
code, d = req('GET', '/listings')
found = any(x.get('id') == listing_id for x in d)
check(f'listing visible in catalog (public GET)', found)

# 5. buyer places deal (POST /deals)
code, d = req('POST', '/deals', {'listing_id': listing_id, 'buyer_company_id': buyer_comp, 'amount_rub': 1234, 'shipping_address': 'Москва, ул. Тест, 1'}, buyer_tok)
check(f'buyer creates deal {code}', code == 201 and d.get('status') == 'created')
if code != 201:
    print('   deal error detail:', d)
deal_id = d.get('id')

# 6. advance the full machine with buyer/seller token (fix B allows buyer to act)
path = ['escrow_paid', 'seller_confirmed', 'shipped', 'delivered', 'buyer_confirmed', 'payout', 'completed']
step_ok = True
for to in path:
    code, d = req('POST', f'/deals/{deal_id}/transition', {'to': to}, buyer_tok)
    # 404 = machine rejected; check ok flag
    if not (d.get('ok') or d.get('deal')):
        step_ok = False
        print('   FAIL transition ->', to, code, d)
    check(f'transition -> {to} ({code})', bool(d.get('ok') or d.get('deal')))

# 7. review for seller (public POST /reviews, but prefer auth)
code, d = req('POST', '/reviews', {'seller_id': seller_comp, 'rating': 5, 'comment': 'I1 live e2e отличный продавец'}, buyer_tok)
check(f'buyer leaves review {code}', code == 201)
code, d = req('GET', f'/companies/{seller_comp}/rating')
print('   rating resp:', code, d)
check('seller rating reflects review', code == 200 and d.get('avg_rating', 0) == 5.0 and d.get('review_count', 0) == 1)

print('\nOVERALL:', 'PASS' if ok else 'FAIL')
print('deal_id', deal_id, 'listing', listing_id)
