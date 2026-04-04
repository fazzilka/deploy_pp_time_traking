.PHONY: run logs down lint type test hooks commit migrate upgrade downgrade sync

UV_CACHE_DIR ?= .uv-cache
UV = UV_CACHE_DIR=$(UV_CACHE_DIR) uv
UV_RUN = $(UV) run --no-sync

run:
	docker compose up --build -d

logs:
	docker compose logs -f backend

down:
	docker compose down

sync:
	$(UV) sync --frozen

lint:
	$(UV_RUN) ruff format src tests
	$(UV_RUN) ruff check --fix src tests

type:
	$(UV_RUN) mypy src

test:
	$(UV_RUN) pytest tests -q

hooks:
	$(UV_RUN) pre-commit install
	$(UV_RUN) pre-commit run --all-files

commit:
	$(UV_RUN) cz commit

migrate:
	$(UV_RUN) alembic revision --autogenerate -m "manual migration"

upgrade:
	$(UV_RUN) alembic upgrade head

downgrade:
	$(UV_RUN) alembic downgrade -1
