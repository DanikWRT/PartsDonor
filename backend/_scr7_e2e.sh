#!/usr/bin/env bash
# SCR-7 e2e: knowledge base (articles by rubric). Raw paths on BASE. exit 0 only if all pass.
set -u
PORT="${PORT:-8001}"
BASE="http://127.0.0.1:${PORT}"
FAIL=0

note() { echo "[scr7] $*"; }
fail() { echo "[scr7] FAIL: $*"; FAIL=1; }

R=$RANDOM$RANDOM
EMAIL="kb_author_${R}_$(date +%s)@gmail.com"
PASS="secret123"
CAT="лайфхаки"
note "base=$BASE R=$R cat=$CAT"

# 1) register author user + login
REG=$(curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"role\":\"seller\",\"company_name\":\"КБ Автор $R\"}")
AUTHOR_ID=$(echo "$REG" | jq -r .id 2>/dev/null)
[ "$AUTHOR_ID" != "null" ] && [ -n "$AUTHOR_ID" ] || { fail "register: $(echo "$REG" | head -c 300)"; }
LOGIN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(echo "$LOGIN" | jq -r .access_token 2>/dev/null)
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || { fail "login"; TOKEN=""; }
AUTH="Authorization: Bearer $TOKEN"
note "author user $AUTHOR_ID"

# 2) POST a unique article whose title/body contain the token
TITLE="Схема замены экрана $R"
BODY="Пошагово для партии $R: открутить винты, снять модуль, приклеить. Токен $R."
POST=$(curl -s -X POST "$BASE/kb/articles" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"cat\":\"$CAT\",\"title\":\"$TITLE\",\"excerpt\":\"Инструкция по ремонту $R\",\"body\":\"$BODY\",\"model\":\"iPhone 12\",\"tags\":\"экран,ремонт,$R\",\"priority\":0}")
AID=$(echo "$POST" | jq -r .id 2>/dev/null)
[ "$AID" != "null" ] && [ -n "$AID" ] || { fail "create article: $(echo "$POST" | head -c 400)"; }
note "article $AID"

# 3a) appears in /kb/articles (unfiltered)
ALL=$(curl -s "$BASE/kb/articles?limit=100")
echo "$ALL" | jq -e --arg t "$R" '.[] | select(.title|contains($t))' >/dev/null 2>&1 || fail "article missing in /kb/articles"
# 3b) q search finds it (URL-encoded)
Q=$(curl -s -G "$BASE/kb/articles" --data-urlencode "q=$R")
echo "$Q" | jq -e --arg t "$TITLE" '.[] | select(.title==$t)' >/dev/null 2>&1 || fail "q search didn't find article"
# 3c) cat filter + q finds it (URL-encoded)
CQ=$(curl -s -G "$BASE/kb/articles" --data-urlencode "cat=$CAT" --data-urlencode "q=$R")
echo "$CQ" | jq -e --arg t "$R" '.[] | select(.title|contains($t))' >/dev/null 2>&1 || fail "cat filter + q didn't find article"
note "list/q/cat ok"

# 4) categories counts include it
CCA=$(curl -s "$BASE/kb/categories")
CNT=$(echo "$CCA" | jq -r --arg c "$CAT" '.[] | select(.slug==$c) | .article_count')
[ -n "$CNT" ] && [ "$CNT" -ge 1 ] || fail "categories count for $CAT not >=1, got '$CNT'"
note "categories count($CAT)=$CNT"

# 5) vote increments votes + rating
VB=$(curl -s "$BASE/kb/articles/$AID" | jq -r .votes)
VOTE=$(curl -s -X POST "$BASE/kb/articles/$AID/vote" -H 'Content-Type: application/json' -d '{"rating":5,"delta":1}')
VA=$(echo "$VOTE" | jq -r .votes)
RAT=$(echo "$VOTE" | jq -r .rating)
[ "$VA" = "$((VB+1))" ] || fail "votes not incremented before=$VB after=$VA"
echo "$VOTE" | jq -e '.rating > 0' >/dev/null 2>&1 || fail "rating not >0, got $RAT"
note "vote ok votes $VB->$VA rating=$RAT"

# 6) top authors shows this author
TOP=$(curl -s "$BASE/kb/authors/top?limit=20")
echo "$TOP" | jq -e --arg e "$EMAIL" '.[] | select(.author_name==$e)' >/dev/null 2>&1 || fail "top-authors missing $EMAIL"
note "top-authors ok"

# cleanup: delete the created article so runs stay deterministic
DEL=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/kb/articles/$AID" -H "$AUTH")
[ "$DEL" = "204" ] || note "cleanup delete returned $DEL"

[ "$FAIL" -eq 0 ] && { note "ALL PASS"; exit 0; } || exit 1
