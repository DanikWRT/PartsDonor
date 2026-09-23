"""Check the backend venv has the required deps."""
import importlib

deps = ["fastapi", "uvicorn", "sqlalchemy", "asyncpg", "pydantic", "pydantic_settings",
        "alembic", "httpx", "inventree", "aiosqlite"]

for d in deps:
    try:
        m = importlib.import_module(d)
        print(f"OK  {d}  {getattr(m, '__version__', '?')}")
    except Exception as e:
        print(f"MISS {d}: {e!r}")
