#!/usr/bin/env bash
# BE-6 e2e: storefront aggregate + share/text against a backend serving THIS tree.
# Runs against PORT (default 8010). Ends with real exit 0 only if everything passes.
set -u
PORT="${PORT:-8010}"
BASE="http://127.0.0.1:${PORT}"
FAIL=0

note() { echo "[be6] $*"; }
fail() { echo "[be6] FAIL: $*"; FAIL=1; }

# unique per-run seller (must be @gmail.com for EmailStr)
EMAIL="sf_$$_$(date +%s)@gmail.com"
PASS="secret123"

note "base=$BASE email=$EMAIL"

# 1) register seller (creates company + slug)
REG=$(curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"role\":\"seller\",\"company_name\":\"Бе6 Витрина ТЕСТ\"}")
echo "$REG" | jq -e .id >/dev/null 2>&1 || { fail "register: $(echo "$REG" | head -c 300)"; }
note "registered seller"

# 2) login -> token + company_id
LOGIN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(echo "$LOGIN" | jq -r .access_token)
COMPANY_ID=$(echo "$LOGIN" | jq -r .company_id)
[ "$TOKEN" != "null" ] && [ -n "$TOKEN" ] || { fail "login: no token ($(echo "$LOGIN" | head -c 200))"; TOKEN=""; }
[ "$COMPANY_ID" != "null" ] && [ -n "$COMPANY_ID" ] || { fail "login: no company_id"; }
note "login ok company_id=$COMPANY_ID"

# 2b) get company slug
COMPANY=$(curl -s "$BASE/companies/$COMPANY_ID")
SLUG=$(echo "$COMPANY" | jq -r .slug)
[ "$SLUG" != "null" ] && [ -n "$SLUG" ] || { fail "no company slug ($(echo "$COMPANY" | head -c 200))"; SLUG=""; }
note "slug=$SLUG"

# 3) create 2 listings as seller
AUTH="Authorization: Bearer $TOKEN"
TITLE1="Дисплей тест BE6 $RANDOM"
TITLE2="Аккумулятор тест BE6 $RANDOM"
L1=$(curl -s -X POST "$BASE/listings" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"title\":\"$TITLE1\",\"price_rub\":1999.5,\"condition\":\"working\",\"provenance\":\"e2e\"}")
L2=$(curl -s -X POST "$BASE/listings" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"title\":\"$TITLE2\",\"price_rub\":800,\"condition\":\"untested\",\"provenance\":\"e2e\"}")
LID1=$(echo "$L1" | jq -r .id 2>/dev/null)
LID2=$(echo "$L2" | jq -r .id 2>/dev/null)
[ "$LID1" != "null" ] && [ -n "$LID1" ] || { fail "listing1: $(echo "$L1" | head -c 300)"; }
[ "$LID2" != "null" ] && [ -n "$LID2" ] || { fail "listing2: $(echo "$L2" | head -c 300)"; }
note "created listings $LID1 $LID2"

# 4) GET /storefront/{slug}
SF=$(curl -s -o /tmp/be6_sf.json -w '%{http_code}' "$BASE/storefront/$SLUG")
[ "$SF" = "200" ] || { fail "storefront http=$SF"; }
COMP_NAME=$(jq -r .company.name /tmp/be6_sf.json)
echo "$COMP_NAME" | grep -q "Бе6 Витрина ТЕСТ" || fail "storefront company.name mismatch: $COMP_NAME"
jq --arg t "$TITLE1" '.items[] | select(.title==$t)' /tmp/be6_sf.json >/dev/null 2>&1 || fail "storefront items missing title1"
TOT=$(jq -r .metrics.total_listings /tmp/be6_sf.json)
[ "$TOT" -ge 2 ] || fail "storefront metrics.total_listings < 2 (got $TOT)"
note "storefront 200 total=$TOT company=$COMP_NAME"

# 5) POST /share/text
SHARE_BODY=$(jq -n --arg a "$LID1" --arg b "$LID2" --arg note "@продавец срочно!" \
  '{listing_ids: [$a,$b], note: $note, include_links: true}')
SHARE=$(curl -s -X POST "$BASE/share/text" -H 'Content-Type: application/json' -d "$SHARE_BODY")
SHARE_TEXT=$(echo "$SHARE" | jq -r .text 2>/dev/null)
echo "$SHARE_TEXT" | grep -q "$TITLE1" || fail "share text missing title1"
echo "$SHARE_TEXT" | grep -q "$TITLE2" || fail "share text missing title2"
echo "$SHARE_TEXT" | grep -q "Отправлено через PartsHub" || fail "share text missing footer"
echo "$SHARE_TEXT" | grep -q "part/$LID1" || fail "share text missing link"
note "share/text ok: $(echo "$SHARE_TEXT" | head -1)"

# 6) share/text empty listing_ids -> 400
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/share/text" \
  -H 'Content-Type: application/json' -d '{"listing_ids":[]}')
[ "$CODE" = "400" ] || fail "share empty expected 400 got $CODE"
note "share empty -> 400"

echo "==== BE-6 E2E RESULT: $([ "$FAIL" -eq 0 ] && echo PASS || echo FAIL) ($FAIL failures) ===="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
