import json, random
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8001"
r = random.randint(1000, 9999)
email = f"m8_{r}@gmail.com"

def req(method, path, body=None, token=None, reraise=False):
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        if reraise:
            raise
        return e.code, json.loads(e.read() or b"null")

# register seller
st, reg = req("POST", "/auth/register", {
    "email": email, "password": "secret123", "role": "seller",
    "company_name": f"Мастерская m8 {r}",
})
print("register:", st)
print(json.dumps(reg, ensure_ascii=False))
cid = reg.get("company_id")
print("company_id:", cid)

# login
st, login = req("POST", "/auth/login", {"email": email, "password": "secret123"})
token = login.get("access_token")
print("login:", st, "role=", login.get("role"), "company_id=", login.get("company_id"))

# PUT full master profile payload
payload = {
    "tagline": f"Чиню любые телефоны за 1 день [{r}]",
    "city": "Москва",
    "since": 2015,
    "experience": [{"year": 2015, "title": "Старт", "desc": "Начал ремонт"}],
    "services": ["Замена дисплея", "Замена АКБ"],
    "arsenal": [{"name": "Паяльник", "note": "Профессиональный"}],
    "portfolio": [{"title": "iPhone 12", "desc": "Замена экрана"}],
    "b2b": ["Опт", "Поставки"],
    "contacts": [{"type": "phone", "value": "+79990000000"}],
}
st, put = req("PUT", f"/master/profiles/{cid}", payload, token=token)
print("PUT:", st)
print(json.dumps(put, ensure_ascii=False)[:1000])

# GET shape
st, got = req("GET", f"/master/profiles/{cid}")
print("\nGET /master/profiles/{cid}:", st)
print("KEYS:", sorted(got.keys()))
print(json.dumps(got, ensure_ascii=False, indent=1)[:1800])

# --- verify seeded rating distribution (avg 4.4 from [5,5,5,4,3]) ---
seed_cid = "aff60cdc-2764-470f-96f7-d383f256f6a9"
st, sd = req("GET", f"/master/profiles/{seed_cid}")
print("\nSeeded profile rating check:", st)
print("  avg_rating =", sd.get("avg_rating"), "(expect 4.4)")
print("  review_count =", sd.get("review_count"), "(expect 5)")
print("  distribution =", sd.get("rating_distribution"), "(expect 5->3, 4->1, 3->1)")

# GET list
st, lst = req("GET", "/master/profiles")
print("\nGET /master/profiles (list):", st, "count=", len(lst) if isinstance(lst, list) else "N/A")
if isinstance(lst, list) and lst:
    print("first item keys:", sorted(lst[0].keys()))
    print("first item:", json.dumps(lst[0], ensure_ascii=False)[:800])
