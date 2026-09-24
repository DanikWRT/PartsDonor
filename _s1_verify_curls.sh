#!/bin/bash
# S-1 acceptance curls (post-fix, clean on active lot).
set -u
API=http://127.0.0.1:8001
LOT=ba777dfc-7db7-43cd-8f6a-f707226f5a7d
LOG=/home/aifactory/PartsDonor/backend/_s1_verify_curls.log
BUYER_EMAIL=ux2sub.verify@gmail.com
BUYER_PASS=buyer123

: > "$LOG"
say() { echo "$@" | tee -a "$LOG"; }
say "=== $(date -Is) S-1 curl verification (final) ==="

# reset lot to active to test buyer flow from clean state
cd /home/aifactory/PartsDonor/backend && PARTSDONOR_TEST=1 .venv/bin/python _s1_reset.py >> "$LOG" 2>&1

# 1 anonymous detail
CODE=$(curl -s -o /tmp/pd_lot.json -w '%{http_code}' "$API/donor-lots/$LOT")
N=$(jq '.components | length' /tmp/pd_lot.json 2>/dev/null)
STATUS=$(jq -r '.status' /tmp/pd_lot.json 2>/dev/null)
SLOTS=$(jq -r '[.components[].slot] | length' /tmp/pd_lot.json 2>/dev/null)
say "[RESET] lot status before=active"
say "GET /donor-lots/{id} (anon) -> $CODE components=$N status=$STATUS"
if [ "$CODE" = "200" ] && [ "$N" -ge 5 ]; then say "  [PASS] anon detail 200 with >=5 components"; else say "  [FAIL] expected 200 + >=5"; fi

# auth gates
C_REQ=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"amount_rub":35000,"message":"p"}' "$API/donor-lots/$LOT/request")
say "POST /request (no token) -> $C_REQ";  [ "$C_REQ" = "401" ] && say "  [PASS] 401" || say "  [FAIL] exp 401"
C_DEAL=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/donor-lots/$LOT/deals")
say "POST /deals (no token) -> $C_DEAL";  [ "$C_DEAL" = "401" ] && say "  [PASS] 401" || say "  [FAIL] exp 401"

# buyer
TOKEN=$(curl -s -X POST -H 'Content-Type: application/json' -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"$BUYER_PASS\"}" "$API/auth/login" | jq -r '.access_token // empty')
[ -n "$TOKEN" ] && say "  [PASS] buyer login (len ${#TOKEN})" || say "  [FAIL] login"
C_REQ2=$(curl -s -o /tmp/pd_req2.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{"amount_rub":35000,"message":"verify"}' "$API/donor-lots/$LOT/request")
say "POST /request (buyer) -> $C_REQ2"; [ "$C_REQ2" = "201" ] && say "  [PASS] request 201" || say "  [FAIL] exp 201"
C_DEAL2=$(curl -s -o /tmp/pd_deal2.json -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" "$API/donor-lots/$LOT/deals")
DEAL_ID=$(jq -r '.deal.id // empty' /tmp/pd_deal2.json 2>/dev/null)
say "POST /deals (buyer) -> $C_DEAL2 deal_id=$DEAL_ID"; [ "$C_DEAL2" = "201" ] && [ -n "$DEAL_ID" ] && say "  [PASS] deal 201" || say "  [FAIL] exp 201"

# post state
CODE3=$(curl -s -o /tmp/pd_lot3.json -w '%{http_code}' "$API/donor-lots/$LOT")
say "GET detail after deal -> $CODE3 status=$(jq -r '.status' /tmp/pd_lot3.json) listing_id=$(jq -r '.listing_id' /tmp/pd_lot3.json)"

# BOM/catalog
say "GET /donor-lots -> $(curl -s -o /tmp/pd_list.json -w '%{http_code}' "$API/donor-lots") count=$(jq 'length' /tmp/pd_list.json) cc=$(jq -r '.[0].component_count' /tmp/pd_list.json)"
say "GET /donor/6 -> $(curl -s -o /tmp/pd_bom.json -w '%{http_code}' "$API/donor/6") comps=$(jq '.components | length' /tmp/pd_bom.json)"

ERRS=$(grep -c "MissingGreenlet\|DetachedInstance\|RuntimeWarning\|не удалось собрать" /tmp/pd_s1_backend.log 2>/dev/null || echo 0)
say "backend log warnings/errors: $ERRS"
say "=== done ==="
