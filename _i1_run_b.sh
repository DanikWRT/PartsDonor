#!/bin/bash
cd /home/aifactory/PartsDonor
/home/aifactory/.local/bin/pi -p "Execute the task in /home/aifactory/PartsDonor/_i1_fix_b_spec.md exactly. Read the spec and make the backend edit in backend/app/auth.py and frontend edits in frontend/src/auth.jsx and frontend/src/pages/BuyerCabinet.jsx. Then change directory to frontend, run npm run build, and confirm it exits 0. Do NOT restart any backend server yourself - another process handles that. Report the final diff summary of what you changed." --provider wormsoft --model deepseek-ai/deepseek-v4-pro 2>&1 | tail -50
