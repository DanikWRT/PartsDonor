import json, urllib.request
req = urllib.request.Request('http://127.0.0.1:8001/deals')
d = json.load(urllib.request.urlopen(req))
print('total deals', len(d))
m = [x for x in d if x.get('id') == '3c6ed881']
print('found 3c6ed881:', bool(m))
for x in d[-5:]:
    print(x.get('id'), x.get('status'), x.get('escrow_status'), 'buyer=', x.get('buyer_company_id'), 'seller=', x.get('seller_company_id'))
