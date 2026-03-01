FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim AS builder
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev
COPY . .
RUN uv sync --frozen --no-dev

FROM python:3.14-slim AS runtime
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PATH="/app/.venv/bin:$PATH"
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 8000
CMD ["sh", "-c", "uvicorn src.main:app --host ${APP_HOST:-0.0.0.0} --port ${APP_PORT:-8000}"]
