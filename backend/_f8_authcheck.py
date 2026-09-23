import json, time, urllib.request

base = 'http://127.0.0.1:8001'
email = 'f8check.%d@gmail.com' % int(time.time())

def call(path, body):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

print('EMAIL', email)
s, d = call('/auth/register', {'email': email, 'password': 'secret123', 'role': 'buyer'})
print('register buyer', s, d)
s, d = call('/auth/login', {'email': email, 'password': 'secret123'})
print('login buyer', s, d)
# seller register with company
s, d = call('/auth/register', {'email': email.replace('@', '-seller@'), 'password': 'secret123', 'role': 'seller', 'company_name': 'F8 Тест Мастерская'})
print('register seller', s, d)
s, d = call('/auth/login', {'email': email.replace('@', '-seller@'), 'password': 'secret123'})
print('login seller', s, d)
# bad password
s, d = call('/auth/login', {'email': email, 'password': 'wrongpass'})
print('bad login', s, d)
