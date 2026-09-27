PERF-3 frontend perf — verification report
==========================================
Card: t_c076b799  Branch: wt/t_c076b799  Commit: 83e81e5

WHAT CHANGED (4 requirements, all implemented + verified)

1) React.lazy route code-splitting  [App.jsx]
   - All 17 page imports converted to React.lazy(() => import(...)),
     wrapped in <React.Suspense fallback={RouteFallback}>.
   - Production build now emits 17 per-route chunks instead of one ~310 kB bundle.
   - PROOF (vite preview + Playwright asset tracking):
       first paint of / loads ONLY index+Catalog+DonorExploded+css (4 assets);
       navigating to /donor-lots pulls exactly ONE new chunk (DonorLots.js).
   - Bundle: 310.10 kB (gzip 93.07) -> index 173.83 kB (gzip 56.93) + per-route chunks.

2) loading="lazy" on images
   - Completed the one missing <img> (DonorWizard.jsx photo uploads). All other
     <img> tags across pages already had loading="lazy" (audited all pages).

3) Virtualization of long lists (catalog / chats)
   - NEW component frontend/src/components/WindowedList.jsx: real DOM-node windowing
     (absolute window + spacer, same approach as react-window) for the chat dialog
     list in Chats.jsx (uniform .ch-row ~72px).
   - Native browser virtualization via CSS content-visibility:auto +
     contain-intrinsic-size for variable-height cards/messages: .donor-card,
     .part-card, .sf-product-card, .pd-donor-card, .ch-msg.
   - VERIFIED: computed style content-visibility=auto on donor cards.

4) Memoization of heavy exploded-view (развёртка) components
   - DonorExploded.jsx: ExplodedScheme, DonorExplodedMini, SlotLayer wrapped in React.memo.
   - Catalog.jsx: DonorCard, PartCard memoized. Chats.jsx: DialogRow memoized.
   - VERIFIED: 7 donor cards still render exploded schemes (memo didn't break rendering).

ACCEPTANCE
  - npm run build: exit 0, 54 modules, built in ~1.06s. (criterion met)
  - Backend part N/A for this card: PERF-3 is purely frontend. No alembic migration,
    no e2e-curl needed (no backend change). Parent PERF-2 already covered pagination/cache.
  - Runtime smoke (Playwright vs dev server on shared backend :8001): Catalog(/) 7 donor
    cards, /donor-lots 7 cards, /storefront, /chats (auth-gated -> login prompt),
    /login — all mount. ZERO console/page JS errors.

FILES CHANGED (7)
  frontend/src/App.jsx
  frontend/src/components/WindowedList.jsx   (new)
  frontend/src/components/DonorExploded.jsx
  frontend/src/pages/Catalog.jsx
  frontend/src/pages/Chats.jsx
  frontend/src/pages/DonorWizard.jsx
  frontend/src/styles.css

ENV BITES LEARNED
  - vite preview/dev port collisions common (5199 already held); always --strictPort + fresh port.
  - Browser asset-track proof of code-split only works against the PRODUCTION build
    (vite preview), not the dev server (dev serves /src/... without /assets/ hashes).
