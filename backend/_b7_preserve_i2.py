"""B7 cleanup: preserve Pi's out-of-scope I2 (YooKassa) work to a reference dir,
then strip it from the B7 deliverables so B7 stays reviews-only.

Operates on the B7 working tree. B7's own deliverable (rating endpoint + reviews)
is untouched. I2 belongs to a separate card; we only move it out of B7's diff.
"""
import os
import re
import shutil

REPO = "/home/aifactory/PartsDonor"
REF = f"{REPO}/docs/i2-yookassa-reference"
os.makedirs(REF, exist_ok=True)

# ---- 1. Preserve yookassa_client.py ----
shutil.copy(f"{REPO}/backend/app/yookassa_client.py", f"{REF}/yookassa_client.py")

# ---- 2. Preserve the I2 main.py block (YooKassa section) ----
main_path = f"{REPO}/backend/app/main.py"
src = open(main_path).read()
start = src.index("# ============================== ЮKASSA (Безопасная сделка)")
end = src.index("# ============================== REVIEWS")
i2_main = src[start:end]
open(f"{REF}/main_i2_block.py", "w").write(i2_main)

# preserve the I2 schemas (DealPay*, WebhookAck)
sch_path = f"{REPO}/backend/app/schemas.py"
sch = open(sch_path).read()
i2_sch = sch[sch.index("class DealPayIn"):sch.index("# --- Review ---")]
open(f"{REF}/schemas_i2_block.py", "w").write(i2_sch)

print("preserved I2 main block bytes:", len(i2_main))
print("preserved I2 schemas block bytes:", len(i2_sch))
print("REF contents:", sorted(os.listdir(REF)))
