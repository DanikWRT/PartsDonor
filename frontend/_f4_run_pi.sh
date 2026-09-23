#!/usr/bin/env bash
# F4 executor via Pi headless
set -e
cd /home/aifactory/PartsDonor
OUT=/home/aifactory/PartsDonor/frontend/_f4_pi_run.log
PI_PROMPT='Read /home/aifactory/PartsDonor/frontend/_f4_spec_corrected.md. Execute the PartsDonor F4 buyer-cabinet module exactly as specified: create cart.jsx CartContext, wrap App.jsx, header cart badge, add add-to-cart buttons in Catalog.jsx and PartDetail.jsx, rework BuyerCabinet.jsx to the LIVE 8-state deal machine using POST /deals/{id}/transition, add CSS. Do not touch backend or the seller Cabinet.jsx. Run npm run build and fix until it exits 0. Then start vite dev in background and take /buyer screenshots at 390x844 and 1440x900. Report the list of files changed, build status, and screenshot absolute paths. Keep output concise.'
pi -p "$PI_PROMPT" --provider wormsoft --model deepseek-ai/deepseek-v4-pro > "$OUT" 2>&1
echo "PI_EXIT=$?" >> "$OUT"
