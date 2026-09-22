"""PartsDonor backend — конфигурация (pydantic-settings, из env/.env)."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки PartsDonor. Читаются из env или backend/.env."""

    # Своя транзакционная БД (торговый домен)
    database_url: str = "postgresql+asyncpg://pduser:pdpass@localhost:5433/partsdonor"

    # InvenTree — source of truth инвентаря
    inventree_base_url: str = "http://127.0.0.1:8000"
    inventree_token: str = ""  # Authorization: Token <key> (см. docs/data-model.md)

    # ЮKassa (Безопасная сделка), СДЭК — заполнить позже (MVP-скелет)
    yookassa_shop_id: str = ""
    yookassa_secret_key: str = ""
    # Секрет уведомлений (вебхуков) ЮKassa — для проверки HMAC-подписи
    yookassa_notification_secret: str = ""
    # Тестовый режим: true — не ходим в боевой API, отдаём синтетический платеж
    yookassa_test_mode: bool = True
    yookassa_base_url: str = "https://api.yookassa.ru/v3"
    sdek_account: str = ""
    sdek_secure_password: str = ""

    # B8: JWT (HS256) — секрет и время жизни access-токена
    jwt_secret: str = "dev-insecure-jwt-secret-change-me"
    jwt_expire_minutes: int = 60 * 24

    model_config = SettingsConfigDict(env_file=".env", env_prefix="PARTSDONOR_", extra="ignore")


settings = Settings()
