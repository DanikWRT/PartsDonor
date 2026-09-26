#!/usr/bin/env bash
# SCR-3 e2e: storefront + share/text (tg & max) against a backend serving THIS tree.
# Starts a fresh backend on PORT (default 8011), runs the flow, stops the server.
# Output is written to OUT (default _scr3_e2e_out.txt). Exit 0 only if all pass.
set -u

PORT="${PORT:-8011}"
BASE="http://127.0.0.1:${PORT}"
OUT="${OUT:-_scr3_e2e_out.txt}"
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}" && pwd)"

log() { echo "$*" | tee -a "$OUT"; }
fail() { log "[scr3] FAIL: $*"; FAIL=1; }

: > "$OUT"
log "[scr3] base=$BASE"

# --- start fresh backend from THIS tree on throwaway port ---
PY="$BACKEND_DIR/.venv/bin/python"
if [ ! -x "$PY" ]; then PY="$(command -v uv >/dev/null 2>&1 && echo '')"; fi
if [ -z "$PY" ] || [ "$PY" = '' ]; then
  PY="$BACKEND_DIR/.venv/bin/python"
fi
if [ ! -x "$PY" ]; then
  PY="$(cd "$BACKEND_DIR" && command -v python)"
fi
LDIR="$BACKEND_DIR/app"
START="$PY -m uvicorn app.main:app --host 127.0.0.1 --port $PORT"
SPID=""
(cd "$BACKEND_DIR" && nohup $START > "${OUT}.uvicorn.log" 2>&1 & echo $! > _scr3_pid )
SPID="$(cat _scr3_pid)"
log "[scr3] backend pid=$SPID"

cleanup() {
  if [ -n "$SPID" ] && kill -0 "$SPID" 2>/dev/null; then
    kill "$SPID" 2>/dev/null
    log "[scr3] stopped throwaway server pid=$SPID"
  fi
  rm -f _scr3_pid
}
trap cleanup EXIT

# wait for health
OK=""
for i in $(seq 1 30); do
  if curl -sf "$BASE/health" >/dev/null 2>&1; then OK=1; break; fi
  sleep 1
done
if [ -z "$OK" ]; then
  log "[scr3] backend did not start; uvicorn log tail:"
  tail -20 "${OUT}.uvicorn.log" | tee -a "$OUT"
  fail "backend not up"
  exit 1
fi
log "[scr3] backend up"

# unique per-run seller (must be @gmail.com for EmailStr); company name is
# also randomized per run so the slug is unique and re-runs stay hermetic
# (a fixed company name would re-collide on companies_slug_key).
EMAIL="scr3_$$_$(date +%s)@gmail.com"
PASS="secret123"
CO_NAME="Скр3 Витрина ТЕСТ $$"
log "[scr3] email=$EMAIL"

# 1) register seller (creates company + slug)
REG=$(curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"role\":\"seller\",\"company_name\":\"$CO_NAME\"}")
echo "$REG" | grep -q '"id"' || fail "register: $(echo "$REG" | head -c 300)"
log "[scr3] registered seller"

# 2) login -> token + company_id
LOGIN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(echo "$LOGIN" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
COMPANY_ID=$(echo "$LOGIN" | sed -n 's/.*"company_id":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || { fail "login: no token"; }
[ -n "$COMPANY_ID" ] && [ "$COMPANY_ID" != "null" ] || { fail "login: no company_id"; }
log "[scr3] login ok company_id=$COMPANY_ID"

# 2b) company slug
COMPANY=$(curl -s "$BASE/companies/$COMPANY_ID")
SLUG=$(echo "$COMPANY" | sed -n 's/.*"slug":"\([^"]*\)".*/\1/p')
[ -n "$SLUG" ] || fail "no company slug"
log "[scr3] slug=$SLUG"
# persist slug so the Playwright screenshot script hits THIS run's storefront
echo "$SLUG" > "${OUT%.txt}.slug"

# 3) create 2 listings as seller
AUTH="Authorization: Bearer $TOKEN"
TITLE1="Дисплей скр3 $RANDOM"
TITLE2="Аккумулятор скр3 $RANDOM"
L1=$(curl -s -X POST "$BASE/listings" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"title\":\"$TITLE1\",\"price_rub\":1999.5,\"condition\":\"working\",\"provenance\":\"scr3\"}")
L2=$(curl -s -X POST "$BASE/listings" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"title\":\"$TITLE2\",\"price_rub\":800,\"condition\":\"untested\",\"provenance\":\"scr3\"}")
LID1=$(echo "$L1" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
LID2=$(echo "$L2" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$LID1" ] && [ "$LID1" != "null" ] || fail "listing1: $(echo "$L1" | head -c 300)"
[ -n "$LID2" ] && [ "$LID2" != "null" ] || fail "listing2: $(echo "$L2" | head -c 300)"
log "[scr3] created listings $LID1 $LID2"

# 4) GET /storefront/{slug}
SFCODE=$(curl -s -o "$OUT.sf.json" -w '%{http_code}' "$BASE/storefront/$SLUG")
log "[scr3] GET /storefront/$SLUG -> http $SFCODE"
[ "$SFCODE" = "200" ] || fail "storefront http=$SFCODE"
SF_ITEMS=$(grep -o '"items":\[' "$OUT.sf.json" | wc -l)
grep -q "$TITLE1" "$OUT.sf.json" || fail "storefront missing title1"
grep -q "$TITLE2" "$OUT.sf.json" || fail "storefront missing title2"
log "[scr3] storefront 200 with items (titles present)"

# 5) POST /share/text channel=tg and channel=max
SHARE_BODY_TG=$(printf '{"listing_ids":["%s","%s"],"include_links":true,"channel":"tg"}' "$LID1" "$LID2")
SHARE_BODY_MAX=$(printf '{"listing_ids":["%s","%s"],"include_links":true,"channel":"max"}' "$LID1" "$LID2")

STG=$(curl -s -w '\n%{http_code}' -X POST "$BASE/share/text" -H 'Content-Type: application/json' -d "$SHARE_BODY_TG")
CODE_TG=$(echo "$STG" | tail -1)
TXT_TG=$(echo "$STG" | sed '$d')
log "[scr3] POST /share/text tg -> http $CODE_TG"
[ "$CODE_TG" = "200" ] || fail "share tg http=$CODE_TG (500 crash?)"
echo "$TXT_TG" | grep -q "$TITLE1" || fail "share tg missing title1"
echo "$TXT_TG" | grep -q "$TITLE2" || fail "share tg missing title2"
echo "$TXT_TG" | grep -q "part/$LID1" || fail "share tg missing link1"
echo "$TXT_TG" | grep -q "Отправлено через PartsHub" || fail "share tg missing footer"

SMAX=$(curl -s -w '\n%{http_code}' -X POST "$BASE/share/text" -H 'Content-Type: application/json' -d "$SHARE_BODY_MAX")
CODE_MAX=$(echo "$SMAX" | tail -1)
TXT_MAX=$(echo "$SMAX" | sed '$d')
log "[scr3] POST /share/text max -> http $CODE_MAX"
[ "$CODE_MAX" = "200" ] || fail "share max http=$CODE_MAX (500 crash?)"
echo "$TXT_MAX" | grep -q "$TITLE1" || fail "share max missing title1"
echo "$TXT_MAX" | grep -q "$TITLE2" || fail "share max missing title2"
echo "$TXT_MAX" | grep -q "part/$LID2" || fail "share max missing link2"
echo "$TXT_MAX" | grep -q "Отправлено через PartsHub" || fail "share max missing footer"

echo "" | tee -a "$OUT"
log "----- POST /share/text channel=tg RAW TEXT -----"
log "$TXT_TG"
log ""
log "----- POST /share/text channel=max RAW TEXT -----"
log "$TXT_MAX"
log ""

log "==== SCR-3 E2E RESULT: $([ "$FAIL" -eq 0 ] && echo PASS || echo FAIL) ($FAIL failures) ===="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
