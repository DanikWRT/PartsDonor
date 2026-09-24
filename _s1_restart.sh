#!/bin/bash
# S-1: restart PartsDonor backend (4 workers) after backend/app edits.
set -u
cd /home/aifactory/PartsDonor/backend

pkill -f 'app.main:app' 2>/dev/null || true
sleep 2

nohup .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 4 \
  > /tmp/pd_s1_backend.log 2>&1 &
echo "started pid $!"
sleep 5

curl -s -o /dev/null -w "health=%{http_code}\n" http://127.0.0.1:8001/health
curl -s -o /dev/null -w "donor-lots=%{http_code}\n" http://127.0.0.1:8001/donor-lots
curl -s -o /dev/null -w "donor-lot-detail=%{http_code}\n" \
  http://127.0.0.1:8001/donor-lots/ba777dfc-7db7-43cd-8f6a-f707226f5a7d
ps aux | grep 'app.main:app' | grep -v grep | wc -l
