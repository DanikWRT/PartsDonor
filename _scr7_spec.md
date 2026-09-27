# SCR-7 — База знаний (articles by rubric) — reference 07

Rebuild the PartsDonor knowledge-base page to match `References/ref-parthub/07-knowledge-base.html` (dark blueprint design system). Backend BE-4 (kb) is DONE and live. This card is FRONTEND rebuild + e2e proof.

## Current state (what exists today, BE-3 minimal — REBUILD/migrate these)
- `frontend/src/pages/Kb.jsx` (211 lines) — basic list, LIGHT theme, no hero-stats, no top-authors, no left/right col, no rubric sidebar with counts, no tag cloud, no sort-select matching ref.
- `frontend/src/App.jsx` routes: `/kb` -> Kb (and `/kb/:id` -> Kb detail, same component via useParams id + selected). Existing route is fine; keep it.
- `frontend/src/styles.css` has an old LIGHT `pd-kb-*` block. REPLACE with a dark themed block (prefer new `kb-*` prefixed classes scoped under a `.pd-app-kb` wrapper, mirroring how `ch-*` / `wz-*` / `sf-*` scoped dark themes work).

## Design system (DARK blueprint — match this, NOT the old light page)
CSS variables already defined in styles.css under `.pd-app-showcase` scope. To use them on the KB page, add a `.pd-app-kb` class to the app wrapper AND copy/scaffold the same CSS variable definitions under `.pd-app-kb` scope (do NOT depend on the showcase scope). Add `.bg-blueprint` fixed background layer on the page (reuse existing CSS or replicate ~10 lines).
```
--bg-0:#050608; --accent:#4fa3ff; --accent-2:#7cf7d0; --text:#f0f3f8; --text-2:#a4adc2;
--muted:#6a7388; --green:#22c55e; --yellow:#fbbf24; --red:#ef4444; --blue:#60a5fa;
--purple:#a78bfa; --glass:rgba(255,255,255,.04); --stroke:rgba(255,255,255,.08); --stroke-2:rgba(255,255,255,.16);
```
Font: Inter/system-ui. Mono: Courier New for stamps/codes.

## Reference 07 layout (desktop)
```
hero (h1 + 4 hero-stat cards)          ─ full width
.layout (3 columns):
  aside.left-col (~260px): Рубрики nav-card (cat-list) + Популярные теги nav-card
  main (1fr):          toolbar (search + sort-select) + articles-grid
  aside.right-col (~280px): 🏆 Топ авторов side-card + ⭐ Как работает рейтинг side-card
```
- Desktop >1200px: 3 columns `260px 1fr 280px`.
- <=900px (tablet): right-col hidden, `left-col 220px 1fr`.
- <=600px (mobile): single column — left-col becomes a horizontal spill of rubric chips above the grid; right-col hidden or stacked below; hero-stats 2x2 grid.

## HERO
- h1 «База знаний для мастеров», subtitle: «Схемы, лайфхаки, разборка, совместимость ревизий, проверенные способы ремонта. Публикуйте свой опыт — получайте рейтинг, который поднимает вас в приоритет в выдаче площадки.»
- 4 hero-stat cards: 📚 Статей (total article count), 👨🔧 Авторов (distinct authors), 👁 Просмотров (sum views), ⭐ Средний рейтинг (avg rating). Compute client-side from `GET /kb/articles?limit=100` list (article_count=len, authors=distinct author_id/name, views=sum, rating=mean of rating). Each card: icon, number (ru-RU), label.

## LEFT COL (aside.left-col)
1. nav-card «Рубрики»: `.cat-list` of `.cat-item` — «Все статьи» (+ total count) and each category from `GET /kb/categories` with its `.article_count` badge. Categories: 📐 Схемы (схемы), ⚙️ Как разобрать (разборка), 🔗 Совместимость (совместимость), 💡 Лайфхаки (лайфхаки), 🔧 Ремонт (ремонт). Active item highlighted (accent ring/left inset). Clicking sets cat filter + reloads grid.
2. nav-card «Популярные теги»: `.art-tags` chip cloud. Build from the loaded articles' tags (split by comma, count frequency, show top ~12 as clickable chips; clicking a chip sets the `q` search to that tag).

## MAIN (toolbar + grid)
- `.toolbar`: `.search` box with 🔍 (input #searchInput) + `select.sort-select`:
  options: «Сначала с приоритетом» (priority, then newest), «По рейтингу» (rating), «По просмотрам» (popular), «Сначала новые» (newest).
  NOTE backend sort accepts `newest|popular|rating` only (no priority mode). Map «Сначала с приоритетом» to client-side sort by priority desc then created_at desc AFTER fetching; the other three map to backend `sort` param. Do priority sort client-side (fetch with sort=newest then re-sort).
- `.articles-grid` of article cards. Each card: rubric chip (upper), title (strong), excerpt, meta row: 👤 author, ⭐ rating.toFixed(1) (votes), 👁 views, model badge (if any), priority badge «Приоритет N» if priority>0. Entire card links to `/kb/${id}` (detail view).

## RIGHT COL (aside.right-col)
1. side-card «🏆 Топ авторов»: `GET /kb/authors/top?limit=5` -> for each KbAuthorOut show rank, avatar (initials, gradient from name hash), author_name, article_count («N статей»), total_views («N просмотров»), total_rating («N»).
2. side-card «⭐ Как работает рейтинг»: `.priority-note` — «Авторы с высоким рейтингом получают приоритет в выдаче площадки: их товары показываются выше, а статьи — в топе базы знаний. Рейтинг формируется из оценок читателей, просмотров и отзывов мастеров.»

## DETAIL VIEW (selected article)
When `/kb/:id` or after clicking a card: show full article — rubric chip, title, excerpt, meta (author, rating, views, model), tags cloud, body paragraphs (split by \n), and a «👍 Полезно» button that POSTs `{rating:5, delta:1}` to `/kb/articles/{id}/vote`, then updates the shown rating/votes. Back button «← К списку».

## PUBLICATION MODAL «✍️ Новая статья» (btnCreate in header, only when logged in)
`.modal-overlay > .modal` with `.modal-head` (h2 «Новая статья» + close-btn ✕). `.form-grid`:
- Поле «Рубрика» *: `.choice-group` of 5 choice buttons (📐 Схема / ⚙️ Разборка / 🔗 Совместимость / 💡 Лайфхак / 🔧 Ремонт) mapped to slugs (схемы/разборка/совместимость/лайфхаки/ремонт); single-select, one active at a time.
- Поле «Заголовок» * (input required)
- Поле «Краткое описание» * (textarea)
- `.field-row`: «Модель / устройство» (input) + «Теги (через запятую)» (input)
- Поле «Текст статьи / инструкция» * (textarea)
- Поле «Ссылка на схему / фото (необязательно)» (input) — optional; if provided, store in body or tags? Backend has no link field; append to article as a note inside body OR keep it out of the POST. SIMPLEST: collect it but do NOT send (no backend field) OR append to body. Decision: append to end of body as a line «Ссылка: <url>» only if non-empty.
- Actions: «Отмена» (ghost) + «Опубликовать статью» (primary). Submits `POST /api/kb/articles` via authFetch with the cat slug, title, excerpt, body, model, tags, priority=0. On success close modal, reset filters, refetch categories + articles + top-authors.

## Data & endpoints (VERIFIED live in backend/app/main.py lines 2349-2545)
All can be fetched anonymously EXCEPT POST/PATCH/DELETE which need auth (authFetch adds Bearer; readSession() gives {token,role,user_id,...}).
- GET /api/kb/categories -> [{id,slug,name,sort,article_count}]
- GET /api/kb/articles?cat=&q=&sort=newest|popular|rating&limit&offset -> [KbArticleOut]
  KbArticleOut: {id,cat,title,excerpt,body,model,tags,author_id,priority,rating,votes,views,created_at,updated_at,author_name}
- GET /api/kb/articles/{id} -> KbArticleOut (increments views)
- POST /api/kb/articles {cat,title,excerpt,body,model,tags,priority} -> 201 KbArticleOut (auth; author=current user)
- GET /api/kb/authors/top?limit -> [{author_id,author_name,article_count,total_views,total_rating}]
- POST /api/kb/articles/{id}/vote {rating,delta} -> KbArticleOut

Backend live on http://127.0.0.1:8001 (raw paths, no /api). Frontend calls `/api/...` (vite strips /api). e2e-curl calls raw 8001 (or the card's live port).

## App.jsx changes
- Add `const isKb = pathname === '/kb' || pathname.startsWith('/kb/')` and append ` pd-app-kb` to the wrapper className.
- Do NOT remove existing routes/nav. Keep /kb and /kb/:id.

## CSS
Add a new scoped section to styles.css (prefix `kb-`, plus `.pd-app-kb` wrapper rules defining the token variables). Implement: hero-stats, hero-stat cards, layout 3-col, left-col nav-card/cat-list/cat-item/art-tags, toolbar/search/sort-select, articles-grid/card, right-col side-card/top-authors/priority-note, detail view, modal publication (modal-overlay/modal/form-grid/choice-group/field-row), breakpoints <=600px and <=900px. NO horizontal overflow at 390px and 1440px. Touch targets >=44px on mobile. Do NOT reuse old light pd-kb-* classes for new components.

## Verification (MUST all pass)
1. `npm run build` exit 0.
2. e2e against live backend: register author user (@gmail.com), login, POST a unique article (title/body contain $R token), verify it appears in GET /kb/articles (cat filter + q search), GET /kb/categories counts include it, POST /kb/articles/{id}/vote increments votes, GET /kb/authors/top shows the author. Write `backend/_scr7_e2e.sh` (curl+jq) ending `[ "$FAIL" -eq 0 ] && exit 0 || exit 1`. Per-run deterministic (unique $R token).
3. Run e2e -> ALL PASS.
4. Playwright Node cjs script `screenshots/scr7_shot.cjs`: open /kb, capture screenshots/scr7-kb-desktop.png (1440px 3-col) + scr7-kb-mobile.png (390px, no h-scroll) + scr7-kb-modal.png (modal open). Verify with vision.
5. Save refined spec as _scr7_spec.md.

## Files EXPECTED to change
- frontend/src/pages/Kb.jsx (rebuild dark reference-07 layout)
- frontend/src/App.jsx (pd-app-kb wrapper)
- frontend/src/styles.css (new kb-* dark block + .pd-app-kb scope)
- backend/_scr7_e2e.sh (new)
- screenshots/scr7_shot.cjs + scr7-*.png
- _scr7_spec.md (this, refined)

Worktree: /home/aifactory/PartsDonor/.worktrees/t_3e7123f2 (branch wt/t_3e7123f2). Backend live on 8001. Vite via `node_modules/.bin/vite --port <fresh>` with BE_PORT=8001. Playwright available. Do NOT use npx.
