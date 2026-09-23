# B8 — Аутентификация и RBAC (результат)

## Что сделано

Добавлены аккаунты пользователей и ролевой доступ (RBAC) к backend'у PartsDonor.

- **`backend/app/models.py`** — новая модель `User` (таблица `users`):
  `id uuid`, `email` (unique, indexed), `password_hash` (bcrypt), `role`
  (enum `user_role`: `seller | buyer | admin`), `company_id` (FK →
  `companies.id`, nullable), `created_at`. Seller при регистрации получает свою
  мастерскую (`Company`), buyer — без компании.
- **`backend/app/auth.py`** (новый) — пароли (passlib/bcrypt), JWT (PyJWT,
  HS256), зависимости `get_current_user` (Bearer → User) и `require_roles(...)`
  (фабрика RBAC-зависимостей), роутеры `/auth` и `/admin`.
- **`backend/app/main.py`** — подключены роутеры auth/admin; защищены
  `POST /listings`, `PATCH /listings/{id}`, `POST /deals/{id}/transition`,
  `POST /deals/{id}/pay`. `seller_id` из тела запроса больше не доверяется:
  при создании листинга seller привязывается к компании аутентифицированного
  пользователя. Проверки владения: чужой seller не может патчить чужой листинг
  (403), seller/buyer работают только со своими сделками, `deal_pay` — только
  покупатель сделки (admin — всегда).
- **`backend/app/config.py`** — настройки `PARTSDONOR_JWT_SECRET`
  (dev-дефолт `dev-insecure-jwt-secret-change-me`) и
  `PARTSDONOR_JWT_EXPIRE_MINUTES` (по умолчанию 1440).
- **Зависимости** (`uv add`): `pyjwt`, `passlib[bcrypt]` (с
  `bcrypt==4.0.1` — passlib 1.7.4 несовместим с bcrypt 5.x), `email-validator`.
- **БД**: таблица `users` создана штатным `create_all` при старте (как в
  B4–B7), существующие данные не тронуты. Админ засеян скриптом
  `backend/_b8_seed.py` (`admin@partsdonor.example.com` / `admin123`, idempotent).

## Эндпоинты

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| POST | `/auth/register` | публичный | регистрация buyer/seller (для seller — `company_name`, создаёт Company); 201, дубликат email → 409, роль admin → 403 |
| POST | `/auth/login` | публичный | email+password → `{access_token, token_type, role, user_id}`; ошибка → 401 |
| GET | `/admin/users` | **admin** | список пользователей (email, role, company, created_at) |
| POST | `/listings` | **seller/admin** | создание листинга (seller = компания из токена) |
| PATCH | `/listings/{id}` | **seller/admin** + владелец | правка листинга |
| POST | `/deals/{id}/transition` | **seller/buyer/admin** + участник сделки | переход по статусной машине |
| POST | `/deals/{id}/pay` | **buyer/admin** + покупатель сделки | создание escrow-платежа ЮKassa |

Гейты: нет/битый токен → **401**, чужая роль → **403**, чужой объект → **403**.

## Acceptance-тест (curl, живой backend)

Скрипт `backend/_b8_verify.py` (`.venv/bin/python backend/_b8_verify.py`),
лог — `docs/b8-curl.log`. **23/23 PASS**:

- register buyer/seller → 201; seller получает `company_id`
- login buyer/seller → токен
- дубликат email → 409; неверный пароль → 401
- `/admin/users` с токеном admin → 200; с токеном buyer → 403
- `POST /listings` без токена → 401; с битым токеном → 401;
  с токеном buyer → 403; с токеном seller → 201, `seller_id` = компания из токена
- `PATCH /listings/{id}` чужим seller → 403, владельцем → 200
- transition/pay без токена → 401; регистрация admin → 403
- старые эндпоинты живы: `/health`, `/listings`, `/companies` → 200

`python -m compileall backend/app` — без ошибок. InvenTree и его БД не трогали,
коммитов не делали.

## Повторная сверка (финальный прогон)

Приёмка перезапущена на живом сервере (127.0.0.1:8001, uvicorn app.main:app):
`_b8_verify.py` снова **23/23 ALL PASS, EXIT=0** (все чеки — регистрация, логин,
защищённые seller-маршруты, ownership, admin, регрессия старых эндпоинтов).
Дополнительно `_b8_dealcycle.py` — полный escrow-цикл сделки под auth
(листинг seller-токеном → сделка → transitions created→…→completed, escrow released,
история переходов): **14/14 ALL PASS**. 20 маршрутов на месте (B4–B7 + I2 + auth/admin)
по OpenAPI; `compileall app/` EXIT=0.

Примечание: старый `_b6_verify.py` теперь падает (KeyError) — он создаёт листинг без
токена. Это ожидаемое следствие защищённых маршрутов продавца, а не регрессия
приложения: машина сделок B6 подтверждена auth-aware пробником `_b8_dealcycle.py`.
