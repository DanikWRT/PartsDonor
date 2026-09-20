# PartsDonor backend — FastAPI. Сборка на uv (воспроизводимая).
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app

# Копируем только описание зависимостей и ставим их (кэш слоя)
COPY pyproject.toml uv.lock* ./
COPY app ./app

RUN uv sync --frozen --no-dev

# Запуск uvicorn
EXPOSE 8001
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
