#!/usr/bin/env bash
# POLISH verify: curl checks (TASK 2) appended to _polish_verify.log
ID=ba777dfc-7db7-43cd-8f6a-f707226f5a7d
LOG=/home/aifactory/PartsDonor/backend/_polish_verify.log
{
  echo "--- CURL CHECKS (TASK 2) ---"
  echo "[curl] $(date)"
  curl -s -o /dev/null -w '[curl] GET /donor-lots/{id} anon -> %{http_code}\n' "http://127.0.0.1:8001/donor-lots/$ID"
  curl -s -o /dev/null -w '[curl] GET /donor/6 -> %{http_code}\n' "http://127.0.0.1:8001/donor/6"
  curl -s -o /dev/null -w '[curl] POST /donor-lots/{id}/request anon -> %{http_code}\n' -X POST "http://127.0.0.1:8001/donor-lots/$ID/request" -H 'Content-Type: application/json' -d '{"amount_rub":100}'
  curl -s -o /dev/null -w '[curl] POST /donor-lots/{id}/deals anon -> %{http_code}\n' -X POST "http://127.0.0.1:8001/donor-lots/$ID/deals"
} >> "$LOG"
echo 'curl checks appended'
tail -6 "$LOG"
