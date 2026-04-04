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

RUN chmod +x /app/scripts/docker-entrypoint.sh

EXPOSE 8080

CMD ["./scripts/docker-entrypoint.sh"]
