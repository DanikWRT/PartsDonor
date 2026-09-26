#!/usr/bin/env bash
# BE-5 e2e: Master profile (профиль мастера)
set -u
R=$RANDOM
BASE="http://127.0.0.1:8004"
PASS=0
FAIL=0

pass() { PASS=$((PASS+1)); echo "PASS: $*"; }
fail() { FAIL=$((FAIL+1)); echo "FAIL: $*"; }

check() { # check <desc> <actual> <expected>
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got '$2', want '$3')"; fi
}

EMAIL="master.user$RANDOM@gmail.com"
REG=$(curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"secret123\",\"role\":\"seller\",\"company_name\":\"Мастерская $R\"}")
echo "register: $REG"
COMPANY_ID=$(echo "$REG" | python3 -c 'import sys,json;print(json.load(sys.stdin)["company_id"] or "")' 2>/dev/null)
[ -n "$COMPANY_ID" ] && pass "register seller returns company_id" || fail "register no company_id"

LOGIN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"secret123\"}")
TOKEN=$(echo "$LOGIN" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])' 2>/dev/null)
[ -n "$TOKEN" ] && pass "login returns token" || fail "login no token"
AUTH="Authorization: Bearer $TOKEN"

# --- PUT full payload ---
PUT=$(curl -s -X PUT "$BASE/master/profiles/$COMPANY_ID" -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"tagline\":\"Чиню любые телефоны за 1 день [$R]\",\"city\":\"Москва\",\"since\":2015,
\"experience\":[{\"year\":2015,\"title\":\"Старт\",\"desc\":\"Начал ремонт\"}],
\"services\":[\"Замена дисплея\",\"Замена АКБ\"],
\"arsenal\":[{\"name\":\"Паяльник\",\"note\":\"Профессиональный\"}],
\"portfolio\":[{\"title\":\"iPhone 12\",\"desc\":\"Замена экрана\"}],
\"b2b\":[\"Опт\",\"Поставки\"],
\"contacts\":[{\"type\":\"phone\",\"value\":\"+79990000000\"}]}")
echo "put: $PUT"
TAG=$(echo "$PUT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["tagline"])' 2>/dev/null)
check "PUT echoes tagline" "$TAG" "Чиню любые телефоны за 1 день [$R]"
CITY=$(echo "$PUT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["city"])' 2>/dev/null)
check "PUT echoes city" "$CITY" "Москва"
SINCE=$(echo "$PUT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["since"])' 2>/dev/null)
check "PUT echoes since" "$SINCE" "2015"
SV=$(echo "$PUT" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["services"]))' 2>/dev/null)
check "PUT echoes services count" "$SV" "2"
CN=$(echo "$PUT" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["contacts"]))' 2>/dev/null)
check "PUT echoes contacts count" "$CN" "1"

# --- GET before reviews: distribution keys 1..5, sums to 0 ---
GET=$(curl -s "$BASE/master/profiles/$COMPANY_ID")
echo "get1: $GET"
TG=$(echo "$GET" | python3 -c 'import sys,json;print(json.load(sys.stdin)["tagline"])' 2>/dev/null)
check "GET echoes tagline" "$TG" "Чиню любые телефоны за 1 день [$R]"
RC=$(echo "$GET" | python3 -c 'import sys,json;print(json.load(sys.stdin)["review_count"])' 2>/dev/null)
check "GET initial review_count" "$RC" "0"
KEYS=$(echo "$GET" | python3 -c 'import sys,json;print(" ".join(sorted(json.load(sys.stdin)["rating_distribution"].keys())))' 2>/dev/null)
check "GET distribution keys 1..5" "$KEYS" "1 2 3 4 5"
SUM=$(echo "$GET" | python3 -c 'import sys,json;print(sum(json.load(sys.stdin)["rating_distribution"].values()))' 2>/dev/null)
check "GET distribution sums to review_count" "$SUM" "$RC"

# --- POST 2 reviews with different ratings ---
R1=$(curl -s -X POST "$BASE/reviews" -H 'Content-Type: application/json' \
  -d "{\"rating\":5,\"comment\":\"Отлично [$R]\",\"seller_id\":\"$COMPANY_ID\"}")
echo "review1: $R1"
R2=$(curl -s -X POST "$BASE/reviews" -H 'Content-Type: application/json' \
  -d "{\"rating\":3,\"comment\":\"Неплохо [$R]\",\"seller_id\":\"$COMPANY_ID\"}")
echo "review2: $R2"

# --- re-GET: avg_rating/review_count reflect reviews; dist sums to count ---
GET2=$(curl -s "$BASE/master/profiles/$COMPANY_ID")
echo "get2: $GET2"
RC2=$(echo "$GET2" | python3 -c 'import sys,json;print(json.load(sys.stdin)["review_count"])' 2>/dev/null)
check "GET review_count after 2 reviews" "$RC2" "2"
AR=$(echo "$GET2" | python3 -c 'import sys,json;print(json.load(sys.stdin)["avg_rating"])' 2>/dev/null)
check "GET avg_rating after 5+3" "$AR" "4.0"
SUM2=$(echo "$GET2" | python3 -c 'import sys,json;print(sum(json.load(sys.stdin)["rating_distribution"].values()))' 2>/dev/null)
check "GET distribution sums to review_count(2)" "$SUM2" "$RC2"
D5=$(echo "$GET2" | python3 -c 'import sys,json;print(json.load(sys.stdin)["rating_distribution"]["5"])' 2>/dev/null)
check "GET 5-star bucket has 1" "$D5" "1"
D3=$(echo "$GET2" | python3 -c 'import sys,json;print(json.load(sys.stdin)["rating_distribution"]["3"])' 2>/dev/null)
check "GET 3-star bucket has 1" "$D3" "1"

# --- PUT to non-existent company -> 404 ---
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/master/profiles/00000000-0000-0000-0000-000000000000" \
  -H 'Content-Type: application/json' -H "$AUTH" -d '{"tagline":"x"}')
check "PUT non-existent company -> 404" "$CODE" "404"

# --- GET always returns 200 even without profile ---
G=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/master/profiles/00000000-0000-0000-0000-000000000000")
check "GET non-existent profile -> 200" "$G" "200"

echo ""
echo "=================================="
echo "BE-5 E2E RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && { echo "ALL PASS"; exit 0; } || { echo "SOME FAILED"; exit 1; }
