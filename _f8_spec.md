# F8 — Auth screens: login/registration (PartsDonor frontend)

## Goal
Build a frontend auth module (login + registration) for PartsDonor. Data comes from backend B8 (already live):
- POST /api/auth/register  (proxied by vite: /api -> backend root, so really POST /auth/register)
- POST /api/auth/login     (really POST /auth/login)
Backend returns JWT; the frontend already stores it in localStorage key `pd-token` (F7/DonorView and Deal.jsx already read `pd-token` for protected actions). F8 creates the screens that WRITE that token and let a user sign in/up as seller (мастерская) or buyer, with role-aware redirect to the right cabinet.

## Acceptance
1. Registration + login work on mobile AND desktop, no horizontal overflow (scrollWidth==clientWidth at 390px and 1440px).
2. Register form has role toggle: Продавец (мастерская, shows optional company_name field when role=seller see RegisterIn) / Покупатель. Submitting calls POST /auth/register; on success auto-login or redirect to login showing a success message.
3. Login form calls POST /auth/login; on success stores access_token in localStorage 'pd-token' AND stores the session (role, user_id, email) in localStorage (e.g. 'pd-session' JSON), then redirects to the role-appropriate cabinet: seller -> /cabinet, buyer -> /buyer. (fallback: / if role unknown).
4. Show JWT state in the header: when logged in show the user's role/email + «Выйти» (logout clears pd-token + pd-session and returns to /); when logged out show a «Войти» link -> /login.
5. NICE-TO-HAVE (do if cheap, skip if it balloons scope): after registration auto-login is NOT required by backend (register returns UserOut without token, unlike login). So the clean UX: after successful registration redirect to /login with a success banner «Регистрация прошла, войдите». Keep it simple.
6. Screenshots desktop + mobile of the login screen (and register screen if practical).

## Data & endpoints (VERIFIED live, backend http://127.0.0.1:8001, vite proxies /api -> 8001)
POST /api/auth/register  body: { email, password, role: 'seller'|'buyer', company_name?: string }  -> 201 UserOut {id,email,role,company_id}. Note: register does NOT return a token. Errors: 409 email exists, 403 admin registration forbidden, 422 validation (password min 6, email must be real — use non-reserved domain like user.verify@gmail.com, @test.local/@example.com are REJECTED by EmailStr).
POST /api/auth/login  body: { email, password }  -> TokenOut {access_token, token_type:'bearer', role, user_id} -> store this.
Error 401 {'detail':'Неверный email или пароль'}.
The header currently reads localStorage 'pd-token' only (no session). Store a second key, e.g. 'pd-session' = JSON {token, role, user_id, email} so login state survives reload and the header can show the user.

## Implementation requirements
1. NEW FILE frontend/src/pages/Auth.jsx exporting `AuthPage` (handles both /login and /register modes via prop or route). Implement:
   - A 2-tab/segment control at top: «Вход» and «Регистрация» (NavLink or internal state to /login and /register routes).
   - LOGIN MODE: email + password inputs, submit -> POST /api/auth/login, on ok: localStorage.setItem('pd-token', data.access_token); localStorage.setItem('pd-session', JSON.stringify({token,role,user_id,email})); then navigate(role==='seller' ? '/cabinet' : role==='buyer' ? '/buyer' : '/'). Show inline error on 401.
   - REGISTER MODE: email + password (+ show company_name input only when role=seller; role toggle buyer/seller). Submit -> POST /api/auth/register; on 201 -> navigate('/login', {state:{registered:true}}) and /login shows banner «Регистрация прошла успешно — войдите». Show inline errors (409/422/403).
2. Add due to a subtlety: on mount /login checks location.state.registered for the banner.
3. Header (App.jsx): become session-aware. Add a small `useAuth`-style helper (can live in Auth.jsx or a tiny auth.jsx module) that reads 'pd-session' from localStorage and exposes {session, login(session), logout()}. Header shows when session: `<span>role label + email</span> <button>Выйти</button>`; else `<NavLink to="/login">Войти</NavLink>`. Logout: localStorage.removeItem('pd-token'); removeItem('pd-session'); navigate('/').
4. PRESERVE existing routes/nav in App.jsx — do NOT revert the F2-F6 routes already added there. Only ADD: <Route path="/login" .../>, <Route path="/register" .../> and the header auth block. If a protected route is opened with no token it still falls back to existing view-only behavior (as F5/F7 do). Do not gate existing routes behind auth (out of scope).
5. CSS: add an 'F8' section to frontend/src/styles.css with pd-f8-* classes: auth card centered (max-width ~400px), 2-column role/segment tabs, inputs reuse existing .pd-input, primary button reuse .pd-btn-primary, error/ok banners, responsive: at <=480px full-width card with comfortable touch targets (>=44px rows).
6. `npm run build` exits 0.

## Verification (live: backend 127.0.0.1:8001 + vite 127.0.0.1:5173 running)
- Register a buyer: POST shape via form; confirm localStorage got pd-token+pd-session after login and header shows logged-in + correct redirect target.
- Login a seller: header shows seller role + email; 
- Bad login shows inline error (Неверный email или пароль).
- Adaptive: no horizontal overflow at 390px and 1440px.
- Save screenshots pd-f8-login-desktop.png, pd-f8-login-mobile.png (and pd-f8-register-desktop.png if feasible) in /home/aifactory/PartsDonor.

## Constraints
- Frontend only. Do NOT modify backend/*. Touch: frontend/src/pages/Auth.jsx (new), frontend/src/App.jsx, frontend/src/styles.css. Optionally a tiny frontend/src/auth.jsx helper module for session (recommended so Auth.jsx + App.jsx share logic).
- Email must use non-reserved domain (e.g. @gmail.com) or EmailStr 422s.
- Report final output: files changed, build result, verification steps run, screenshot paths.
