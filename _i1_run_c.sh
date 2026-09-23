#!/bin/bash
cd /home/aifactory/PartsDonor
/home/aifactory/.local/bin/pi -p "Execute the task in /home/aifactory/PartsDonor/_i1_fix_c_spec.md exactly. Read the spec. Make the minimal edits to frontend/src/pages/Deal.jsx (and frontend/src/pages/BuyerCabinet.jsx only if it renders those seller-side status steps per the spec). Change directory to frontend, run npm run build, confirm exit 0. Report the diff summary of what changed." --provider wormsoft --model deepseek-ai/deepseek-v4-pro 2>&1 | tail -40
