"""B7 cleanup part 2: strip the out-of-scope I2 (YooKassa) additions from
main.py and schemas.py so B7 delivers ONLY the reviews/rating change.

Keeps: B6 deal_machine wiring (pre-existing) + B7 company_rating endpoint.
Removes: yookassa import, YooKassa endpoint block, DealPay*/WebhookAck schemas,
config imports used only by I2.
"""
import os
import re

REPO = "/home/aifactory/PartsDonor"

# ---------- main.py ----------
main_path = f"{REPO}/backend/app/main.py"
src = open(main_path).read()

orig = src

# 1. fastapi import: drop Request, status
src = src.replace(
    "from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, status",
    "from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query",
)

# 2. drop config import (used only by I2 webhook)
src = src.replace("from app.config import settings\n", "")

# 3. drop yookassa client import line
src = src.replace("from app.yookassa_client import new_payment_id, yookassa\n", "")

# 4. drop DealPayIn / DealPayOut / WebhookAck from schemas import block
src = src.replace("    DealPayIn,\n    DealPayOut,\n", "")
src = src.replace("    WebhookAck,\n", "")

# 5. remove the whole YooKassa section (from section header up to REVIEWS header)
start = src.index("# ============================== ЮKASSA (Безопасная сделка)")
end = src.index("# ============================== REVIEWS")
src = src[:start] + src[end:]

open(main_path, "w").write(src)
print("main.py stripped: ", orig != src, "| old lines", orig.count(chr(10))+1, "->", src.count(chr(10))+1)

# ---------- schemas.py ----------
sch_path = f"{REPO}/backend/app/schemas.py"
sch = open(sch_path).read()

orig_s = sch
start = sch.index("class DealPayIn")
end = sch.index("# --- Review ---")
sch = sch[:start] + sch[end:]
open(sch_path, "w").write(sch)
print("schemas.py stripped:", orig_s != sch, "| old lines", orig_s.count(chr(10))+1, "->", sch.count(chr(10))+1)

# ---------- remove the orphaned yookassa_client.py (preserved under docs/) ----------
os_remove = f"{REPO}/backend/app/yookassa_client.py"
if os.path.exists(os_remove):
    os.remove(os_remove)
    print("removed backend/app/yookassa_client.py (preserved in docs/i2-yookassa-reference/)")

print("\nDONE")
