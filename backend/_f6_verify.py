import json, urllib.request

def get(path):
    with urllib.request.urlopen('http://127.0.0.1:8001'+path) as r:
        return json.load(r)

reviews = get('/reviews')
print(len(reviews), 'reviews total')
for r in reviews[:5]:
    print(r['rating'], '|', (r['comment'] or '')[:60], '|', r['created_at'])
