.PHONY: run logs down lint type hooks commit migrate upgrade downgrade

run:
	docker compose up --build -d

logs:
	docker compose logs -f backend

down:
	docker compose down

lint:
	uv run ruff format src
	uv run ruff check --fix src

type:
	uv run mypy src

hooks:
	uv run pre-commit install
	uv run pre-commit run --all-files

commit:
	uv run cz commit

migrate:
	uv run alembic revision --autogenerate -m "manual migration"

upgrade:
	uv run alembic upgrade head

downgrade:
	uv run alembic downgrade -1
