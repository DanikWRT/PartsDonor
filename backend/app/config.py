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
    sdek_account: str = ""
    sdek_secure_password: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="PARTSDONOR_", extra="ignore")


settings = Settings()
