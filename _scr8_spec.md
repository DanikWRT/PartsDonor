# SCR-8 — Профиль мастера (reference 08)

## Goal
Rebuild the master profile screen(s) under reference 08 (dark engineering blueprint, 2-column).
Uses BE-5 master-profile API.

## Data / endpoints (verified live on 127.0.0.1:8001 via vite /api proxy)
- GET  /api/master/profiles            -> list[MasterProfileDetail]
- GET  /api/master/profiles/{company_id} -> MasterProfileDetail
- PUT  /api/master/profiles/{company_id} (auth, seller) -> upsert

MasterProfileDetail: { company_id, tagline, city, since, experience[], services[], arsenal[],
  portfolio[], b2b[], contacts[], created_at, avg_rating, review_count,
  rating_distribution {1..5}, company {name, slug, verified, ...} }

## Frontend
- NEW/REBUILT frontend/src/pages/Master.jsx (498 lines):
  - Detail view (route /master/:companyId): profile hero (avatar+name+verify/B2B badges+tagline+
    meta+actions), stats grid (4), arsenal panel, services panel, experience timeline,
    portfolio grid, B2B panel (purple), side col (contacts, rating + distribution bars, storefront link).
  - List view (route /masters): title+search+responsive card grid (each -> detail).
- frontend/src/App.jsx: import Master, add `pd-app-master` wrapper (isMaster),
  routes /masters + /master/:companyId, nav «Мастера».
- frontend/src/styles.css: new scoped `.pd-app-master` dark-blueprint block (tokens+header+ms-*)
  redefining tokens; adaptive (2-col -> 1-col @1100, hero collapse @900, mobile @700/460).

## Verification (this session)
- npm run build exit 0 (53 modules, CSS 115KB + JS 322KB).
- Playwright shot (screenshots/scr8_shot.cjs, FE :5185, BE :8001):
  - list desktop 1440: noHScroll, 4-col grid, 5 cards
  - list mobile 390: noHScroll, 1-col, 5 cards
  - detail desktop 1440: noHScroll, arsenal 6, services 11, exp 3, portfolio 6, b2b 4, contacts 3, ratingBars 5
  - detail mobile 390: noHScroll, all sections
  - full-page desktop: vision-verified all 8 sections clean, none cut off.
- Vision re-verified (vision_analyze): desktop 2-col blueprint, mobile adaptive no overflow.

## Backend
- No backend changes (BE-5 already live). Rating contract re-verified: seeded [5,5,5,4,3]
  -> avg 4.4, review_count 5, dist {1:0,2:0,3:1,4:1,5:3}. GET list returns all profiles.

## Artifacts
- screenshots/scr8-master-{list-desktop,list-mobile,desktop,mobile,full-desktop}.png
- screenshots/scr8_shot.cjs, _scr8_seed.cjs (seed), _scr8_probe.py (BE-5 contract probe)
