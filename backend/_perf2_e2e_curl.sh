#!/usr/bin/env bash
# PERF-2 e2e-curl: pagination smoke test across all list endpoints.
# Asserts 200 and that returned row counts never exceed the requested limit.
set -u
BASE="${1:-http://127.0.0.1:8027}"

check() {
  local path="$1" limit="$2"
  local code cnt
  code=$(curl -s -o /tmp/perf2_body.$$ -w "%{http_code}" "$BASE$path")
  cnt=$(python3 -c "import json; d=json.load(open('/tmp/perf2_body.$$')); n=len(d) if isinstance(d,list) else -1; print(n)")
  if [ "$code" != "200" ]; then
    echo "FAIL $path -> HTTP $code (expected 200)"; return 1
  fi
  if [ -n "$limit" ] && [ "$cnt" -gt "$limit" ]; then
    echo "FAIL $path -> $cnt rows > limit $limit"; return 1
  fi
  echo "OK   $path -> HTTP $code, rows=$cnt (limit=$limit)"
}

fails=0
check "/catalog?limit=5&offset=0" 5    || fails=$((fails+1))
check "/catalog?limit=5&offset=5"  5    || fails=$((fails+1))
check "/catalog?limit=200"         200  || fails=$((fails+1))
check "/listings?limit=3"          3    || fails=$((fails+1))
check "/deals?limit=3"             3    || fails=$((fails+1))
check "/donor-lots?limit=3"        3    || fails=$((fails+1))
check "/reviews?limit=3"           3    || fails=$((fails+1))
check "/notifications?limit=3"     3    || fails=$((fails+1))
check "/donors?limit=3"            3    || fails=$((fails+1))
check "/master/profiles?limit=3"   3    || fails=$((fails+1))
check "/buy-requests/me?limit=3"   3    || fails=$((fails+1))
rm -f /tmp/perf2_body.$$
if [ "$fails" -gt 0 ]; then
  echo "E2E-CURL: FAIL ($fails failures)"
  exit 1
fi
echo "E2E-CURL: PASS"
