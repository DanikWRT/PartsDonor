#!/usr/bin/env bash
set -euo pipefail
# Patch ~/.pi/agent/models.json so the wormsoft provider uses the real API key
# from ~/.hermes/.env (the var name contains AI_WORMSOFT_RU_API_KEY), replacing
# the stale placeholder, without printing the secret.
ENV_FILE="$HOME/.hermes/.env"
CFG="$HOME/.pi/agent/models.json"
KEY="$(sed -n 's/^[A-Za-z0-9_]*AI_WORMSOFT_RU_API_KEY=//p' "$ENV_FILE" | tr -d '\r' | tail -n1)"
if [ -z "$KEY" ]; then
  echo "ERROR: key not found in $ENV_FILE" >&2
  exit 1
fi
KEYLEN="$(echo -n "$KEY" | wc -c)"
echo "key length=$KEYLEN (expected 64)"
if [ "$KEYLEN" != "64" ]; then
  echo "WARN: unexpected key length" >&2
fi
python3 - "$CFG" "$KEY" <<'PY'
import sys, json
path, key = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
p = data.get("providers", {}).get("wormsoft", {})
cur = p.get("apiKey", "")
if cur == key:
    print("UNCHANGED: key already correct")
    sys.exit(0)
p["apiKey"] = key
with open(path, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print("PATCHED: replaced apiKey (old len=%d -> new len=%d)" % (len(cur), len(key)))
PY
