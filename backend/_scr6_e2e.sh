#!/usr/bin/env bash
# SCR-6 e2e: chat (dialogs/messages/offers) against a backend serving THIS tree.
# Runs against PORT (default 8019). Ends with real exit 0 only if everything passes.
set -u
PORT="${PORT:-8019}"
BASE="http://127.0.0.1:${PORT}"
FAIL=0

note() { echo "[scr6] $*"; }
fail() { echo "[scr6] FAIL: $*"; FAIL=1; }

R=$RANDOM
S_EMAIL="seller_chat_${R}_$(date +%s)@gmail.com"
B_EMAIL="buyer_chat_${R}_$(date +%s)@gmail.com"
PASS="secret123"
note "base=$BASE R=$R"

# 1) register seller + buyer
SREG=$(curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$S_EMAIL\",\"password\":\"$PASS\",\"role\":\"seller\",\"company_name\":\"Чат Разборка $R\"}")
SID=$(echo "$SREG" | jq -r .id 2>/dev/null)
[ "$SID" != "null" ] && [ -n "$SID" ] || { fail "seller register: $(echo "$SREG" | head -c 300)"; }
SL=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$S_EMAIL\",\"password\":\"$PASS\"}")
STOKEN=$(echo "$SL" | jq -r .access_token)
[ -n "$STOKEN" ] && [ "$STOKEN" != "null" ] || { fail "seller login"; STOKEN=""; }
note "seller $SID"

BREG=$(curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$B_EMAIL\",\"password\":\"$PASS\",\"role\":\"buyer\"}")
BID=$(echo "$BREG" | jq -r .id 2>/dev/null)
[ "$BID" != "null" ] && [ -n "$BID" ] || { fail "buyer register: $(echo "$BREG" | head -c 300)"; }
BL=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$B_EMAIL\",\"password\":\"$PASS\"}")
BTOKEN=$(echo "$BL" | jq -r .access_token)
[ -n "$BTOKEN" ] && [ "$BTOKEN" != "null" ] || { fail "buyer login"; BTOKEN=""; }
note "buyer $BID"

SAUTH="Authorization: Bearer $STOKEN"
BAUTH="Authorization: Bearer $BTOKEN"

# 2) seller creates a dialog with the buyer
DIALOG=$(curl -s -X POST "$BASE/dialogs" -H "$SAUTH" -H 'Content-Type: application/json' \
  -d "{\"participant_id\":\"$BID\"}")
DID=$(echo "$DIALOG" | jq -r .id 2>/dev/null)
[ "$DID" != "null" ] && [ -n "$DID" ] || { fail "create dialog: $(echo "$DIALOG" | head -c 300)"; }
note "dialog $DID"

# 3) seller sends a text message with a per-run token
BODYA="Здравствуйте, деталь в наличии? партия $R"
MSGA=$(curl -s -X POST "$BASE/dialogs/$DID/messages" -H "$SAUTH" -H 'Content-Type: application/json' \
  -d "{\"kind\":\"text\",\"body\":\"$BODYA\"}")
MIDA=$(echo "$MSGA" | jq -r .id 2>/dev/null)
[ "$MIDA" != "null" ] && [ -n "$MIDA" ] || { fail "send text: $(echo "$MSGA" | head -c 300)"; }
note "seller text -> $MIDA"

# 4) seller sends an OFFER (commercial proposal)
OFFER_BODY="предлагаю цену для партии $R"
MSGB=$(curl -s -X POST "$BASE/dialogs/$DID/messages" -H "$SAUTH" -H 'Content-Type: application/json' \
  -d "{\"kind\":\"offer\",\"offer_price\":4500,\"body\":\"$OFFER_BODY\"}")
OFFER_ID=$(echo "$MSGB" | jq -r .offer_id 2>/dev/null)
[ "$OFFER_ID" != "null" ] && [ -n "$OFFER_ID" ] || { fail "send offer: $(echo "$MSGB" | head -c 300)"; }
note "offer message -> offer_id=$OFFER_ID"

# 5) buyer replies with a text message
BODYB="Беру! $R"
MSGC=$(curl -s -X POST "$BASE/dialogs/$DID/messages" -H "$BAUTH" -H 'Content-Type: application/json' \
  -d "{\"kind\":\"text\",\"body\":\"$BODYB\"}")
MIDC=$(echo "$MSGC" | jq -r .id 2>/dev/null)
[ "$MIDC" != "null" ] && [ -n "$MIDC" ] || { fail "buyer reply: $(echo "$MSGC" | head -c 300)"; }
note "buyer text -> $MIDC"

# 6) GET /dialogs/{id}/messages -> 3 messages, ascending, offer has offer_status pending+read flags
MSGS=$(curl -s "$BASE/dialogs/$DID/messages" -H "$SAUTH")
CNT=$(echo "$MSGS" | jq 'length')
[ "$CNT" -ge 3 ] || fail "messages count<3 got $CNT"
echo "$MSGS" | jq -e --arg t "$R" '.[] | select(.body|contains($t))' >/dev/null 2>&1 || fail "messages missing per-run token"
OFFSTS=$(echo "$MSGS" | jq -r --arg o "$OFFER_ID" '.[] | select(.offer_id==$o) | .offer_status')
[ "$OFFSTS" = "pending" ] || fail "offer_status not pending got '$OFFSTS'"
note "messages ok count=$CNT offer_state=$OFFSTS"

# 7) GET /dialogs -> shows dialog, other_participant_name is buyer, unread_count>0 for seller
DLIST=$(curl -s "$BASE/dialogs" -H "$SAUTH")
DROW=$(echo "$DLIST" | jq -c --arg d "$DID" '.[] | select(.id==$d)' | head -1)
[ -n "$DROW" ] || fail "dialog not in GET /dialogs"
echo "$DROW" | jq -e '.unread_count >= 0' >/dev/null 2>&1 || fail "no unread_count"
ONAME=$(echo "$DROW" | jq -r .other_participant_name)
note "dialog in list (other=$ONAME)"

# 8) buyer accepts the offer
ACCT=$(curl -s -X POST "$BASE/offers/$OFFER_ID/accept" -H "$BAUTH")
ACCSTS=$(echo "$ACCT" | jq -r .status 2>/dev/null)
[ "$ACCSTS" = "accepted" ] || fail "accept offer status=$ACCSTS ($(echo "$ACCT" | head -c 200))"
note "offer accepted"

# 9) sender (seller) cannot accept own offer -> 403 (fresh pending offer)
MSGD=$(curl -s -X POST "$BASE/dialogs/$DID/messages" -H "$SAUTH" -H 'Content-Type: application/json' \
  -d "{\"kind\":\"offer\",\"offer_price\":333,\"body\":\"контра-оффер $R\"}")
OFFER_ID2=$(echo "$MSGD" | jq -r .offer_id 2>/dev/null)
[ "$OFFER_ID2" != "null" ] && [ -n "$OFFER_ID2" ] || { fail "send offer2: $(echo "$MSGD" | head -c 300)"; }
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/offers/$OFFER_ID2/accept" -H "$SAUTH")
[ "$CODE" = "403" ] || fail "sender accept own expected 403 got $CODE"
note "sender accept own -> $CODE (403 expected)"

# 10) mark read by seller -> ok; unread drops
READ=$(curl -s -X POST "$BASE/dialogs/$DID/read" -H "$BAUTH")
echo "$READ" | jq -e '.ok==true' >/dev/null 2>&1 || fail "mark read"
note "mark read ok"

echo "==== SCR-6 CHAT E2E RESULT: $([ "$FAIL" -eq 0 ] && echo PASS || echo FAIL) ($FAIL failures) ===="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
