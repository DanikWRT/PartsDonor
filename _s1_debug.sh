#!/bin/bash
# S-1 debug: why does GET /donor-lots/{id} return components=0 while the list returns 5?
set -u
API=http://127.0.0.1:8001
LOT=ba777dfc-7db7-43cd-8f6a-f707226f5a7d
LOG=/home/aifactory/PartsDonor/backend/_s1_debug.log
: > "$LOG"
say() { echo "$@" | tee -a "$LOG"; }

say "=== $(date -Is) detail debug ==="
say "detail raw:"
curl -s "$API/donor-lots/$LOT" | jq -c '{status, brand, model, donor_part_id, component_count, exploded_url, n_components:(.components|length)}' | tee -a "$LOG"

say "list raw:"
curl -s "$API/donor-lots" | jq -c '.[0] | {status, brand, model, donor_part_id, component_count}' | tee -a "$LOG"

say "device-schemas:"
curl -s "$API/device-schemas" | jq -c '.[] | {id, brand, model, inventree_donor_part_id, hotspots}' | tee -a "$LOG"

say "inventree reachability from backend:"
curl -s -o /dev/null -w "inventree api root -> %{http_code}\n" http://127.0.0.1:8000/api/ | tee -a "$LOG"

say "backend log tail:"
tail -n 40 /tmp/pd_s1_backend.log | tee -a "$LOG"
say "=== done ==="
