Fix two UX bugs in the PartsDonor app at /home/aifactory/PartsDonor. Make focused, working changes and verify them live. Commits will be created by the operator after your changes (do NOT git commit yourself; just leave the working tree modified and produce a written summary of exactly what you changed). Do all verification via the live running stack described below. Report your final output in Russian and English key facts.

=== LIVE STACK ===
- Backend: uvicorn app.main:app --workers 4 on 127.0.0.1:8001, venv at /home/aifactory/PartsDonor/backend/.venv.
- Frontend dev server: vite on 0.0.0.0:5173, project /home/aifactory/PartsDonor/frontend.
- To restart backend after edits: bash /home/aifactory/PartsDonor/_s1_restart.sh (cd /home/aifactory/PartsDonor: pkill 'app.main:app', sleep 2, nohup .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 4, then health checks).
- Build check: cd /home/aifactory/PartsDonor/frontend && npm run build (must exit 0).

=== BUG 1: exploded view layers overlap (NOT exploded) ===
File: frontend/src/components/DonorExploded.jsx -> ExplodedScheme().
Currently each layer button is placed at left:pctX and top:pctY computed purely from c.hotspot (?).x/.y (default 0.5 when hotspot empty). When components arrive WITHOUT hotspot data (empty object) or all identical (common case, e.g. the donor-lot page where hotspots can be missing), all 5 layers stack at exactly the same spot -> user complaint "одно на другое накладывается".

FIX (acceptance: exploded look ALWAYS, even without hotspots): make ExplodedScheme spread the layers along the vertical center axis regardless of hotspot quality:
 - Compute each layer's y-position as a combination/fan-out: if hotspots are present and distinct, honour them; but ALWAYS guarantee a minimum vertical separation so layers never fully overlap. Recommend: sort layers by (hotspot.y, then a defined slot stack order fallback) and place them at evenly-spaced y positions spanning PAD..(VIEW_H-PAD) (i.e. spread N layers over the viewport height), so display near top, battery/board middle, backcover bottom — visually exploded even with zero hotspot data. Every incoming part layer must be individually visible (usuario sees all pieces apart).
 - Keep the existing visual style (pd-layer-btn / pd-flat-hotspot buttons, SlotLayer/FlatDrawing SVG, pd-layer-tag, pd-layer-svg) and the click->DetailPanel select behavior (PartDetail.jsx) intact.
 - Also apply to the small card-grid mini view (DonorExplodedMini / ExplodedScheme) so exploded look reads at small size.
 - Verify via js/DOM: after fix, open a donor-lot and /part/6 page with a donor context and confirm the layer buttons have DIFFERENT top positions (not all equal). Also take desktop+mobile screenshots proving the exploded spread.

=== BUG 2: no real product photos anywhere (count <img> == 0) ===
User complaint "нет вообще фото самого продукта". Currently:
 - backend/app/main.py catalog_detail() returns image_url=None hardcoded (line ~356).
 - backend/app/schemas.py CatalogDetail.image_url exists (line 331) but never populated; DonorComponent (line 350) has NO image field; DonorLotDetail.exploded_url comes from device_schema.exploded_view_url which may be "".
 - frontend/src/pages/PartDetail.jsx and frontend/src/pages/DonorLot.jsx + DonorView.jsx render zero <img> tags.

FIX (acceptance: real photo of the donor device AND photos of the incoming component parts appear on the donor card and the lot page; DOM count <img> > 0 on both desktop and mobile):
 - Backend: fetch real image URLs. The InvenTree Part objects (backend/app/inventree_client.py, uses inventree.get_part / get_bom_subs) carry an "image" field (relative URL like /media/... or full). Wire it through:
   * CatalogDetail.image_url <- real InvenTree part image (or null if none) instead of None.
   * DonorComponent: ADD field image (str|None); populate from the InvenTree BOM sub-part image in get_donor() (main.py ~line 363) and get_donor_lot() (main.py ~line 481) — so each incoming part carries its photo.
   * DonorLotDetail: keep exploded_url from device_schema (that's the donor/apparatus schematic + possibly device photo); add the donor device photo. If the dedicated donor device image is available in InvenTree (inventree_donor_part_id -> get_part -> image), expose it (e.g. as exploded_url fallback or a new donor_image field / reuse image_url). Prefer a real photo over the schematic.
 - Frontend: render the photos, with graceful fallback when image is null/"" (keep current schematic SVG view, never a broken image).
   * DonorLot.jsx (/donor-lot/{id}): add a product photo of the donor device prominently (e.g. in pd-donor-lot-head), AND render each component photo in the exploded view (in the layer button / DetailPanel / the pd-parts list in PartDetail.jsx). 
   * PartDetail.jsx (/part/6 style route): render the part photo (CatalogDetail.image_url) at the top of the card, and component photos in the donor exploded section (pd-parts list and/or layer buttons and selected-part panel).
   * DonorView.jsx and DonorLots.jsx card grid: add donor photo thumbnails so the donor appears everywhere.
 - Ensure at least Real photos. You may generate/source a small set of placeholder product/part JPGs into frontend/public/photos/ (e.g. device-donor.jpg, and one per slot: display/board/battery/camera/backcover .jpg) as the "реальное фото" fallback so pages show actual <img> elements even when InvenTree has no image — but PREFER real InvenTree URLs when present. (Public assets must live under frontend/public and be served; reference as absolute /photos/xxx.jpg.) Make the images look like real device/component photos (solid photographic style), coarse is fine.
 - IMPORTANT: the live donor-lot may not exist in the current DB. If so, seed one idempotently: python backend/_s1_seed.py (backend venv) creates the donor lot (needs device_schema + seller UUIDs already in DB — run backend/seed.py first if schema/seller missing, then _s1_seed.py). Verify /api/donor-lots/{id} returns components WITH hotspots AND image fields.

=== VERIFICATION (must run, then report) ===
 - DOM img count: use a headless browser (playwright or the repo's existing browser scripts, see frontend/s1_verify*.cjs / _ux4_verify.js patterns) to open (a) donor card/lot page and (b) /part/6 page, at desktop (1280) and mobile (390) widths, and assert document.querySelectorAll('img').length > 0; collect the src attributes to prove real photos.
 - Exploded spread: assert all layer buttons on donor-lot have pairwise-distinct top offsets.
 - Screenshots: save pd-uxfix-*-desktop.png / pd-uxfix-*-mobile.png for donor-lot and part pages into /home/aifactory/PartsDonor/ (repo root), matching existing naming (pd-*.png).
 - Backend: curl /api/donor-lots/{id} and confirm components[].image and hotspot are populated and non-empty; curl /api/catalog/{part_id} (e.g. the donor's part id or a listed part) confirm image_url.
 - frontend build: npm run build exit 0.
 - Report any acceptance gap explicitly.

=== REPORT FORMAT (final message) ===
- Exact list of files changed (frontend + backend + seed + any new public assets) with a 1-line description each.
- The verification results (img counts, distinct-top assertion, curl payload excerpts, build exit, screenshot paths).
- Steps the operator must run to commit/verify (restart backend? seed?).
