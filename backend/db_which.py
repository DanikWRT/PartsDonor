"""Диагностика: к какой БД реально подключается alembic env."""
import asyncio
import sys

sys.path.insert(0, ".")

from app.config import settings  # noqa: E402

print("settings.database_url =", settings.database_url)
print("cwd =", __import__("os").getcwd())
print(".env exists:", __import__("os").path.exists(".env"))
