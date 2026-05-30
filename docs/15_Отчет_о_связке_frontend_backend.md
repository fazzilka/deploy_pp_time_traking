# Отчет о связке frontend и backend

## 1. Цель работы

Связать текущий React frontend из `server/frontend/` с FastAPI backend из `server/Backend/` без mock-данных, сохранив frontend как основной контракт. Backend был адаптирован под ожидания frontend там, где отличались имена полей, структура ответов, CORS и порт локального запуска.

## 2. Принцип интеграции

Backend был адаптирован под frontend-контракты. Frontend менялся минимально: `.env.example`, API client и игнорирование локального Vite cache. Вёрстка и поведение страниц не переделывались.

## 3. Изученные файлы

- `README.md`
- `server/frontend/README.md`
- `server/Backend/README.md`
- `docs/03_Модель_данных.md`
- `docs/05_Интерфейс_программирования_приложения.md`
- `docs/06_План_тестирования.md`
- `docs/10_Авторизация_роли_профиль_активность.md`
- `samples/example_requests.http`
- `server/frontend/src/shared/api/*`
- `server/frontend/src/shared/types/*`
- `server/frontend/src/pages/*`
- `server/frontend/src/components/ProtectedRoute/ProtectedRoute.tsx`
- `server/frontend/src/components/Navigation/Navigation.tsx`
- `server/Backend/src/main.py`
- `server/Backend/src/api/v1/*`
- `server/Backend/src/schemas/*`
- `server/Backend/src/services/*`
- `server/Backend/src/models/*`
- `server/Backend/Makefile`
- `server/Backend/docker-compose.yml`
- `server/Backend/pyproject.toml`

## 4. Ожидания frontend

Подробно зафиксированы в `docs/12_FRONTEND_API_EXPECTATIONS.md`.

Ключевые ожидания:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET/PATCH /api/v1/users/me`
- `GET /api/v1/users/me/activity?year=2026`
- `GET/POST/PATCH/DELETE /api/v1/tasks`
- `POST /api/v1/tasks/{task_id}/timer/start`
- `POST /api/v1/tasks/{task_id}/timer/stop`
- `GET /api/v1/summary`
- task response использует `time_intervals`
- interval response использует `ended_at`
- summary response использует `total_time_seconds_all_tasks`
- JWT хранится в `localStorage.access_token`

## 5. Что было изменено в backend

- `TaskRead` теперь возвращает frontend-compatible поле `time_intervals` вместо наружного `intervals`.
- `TimeIntervalRead` теперь возвращает frontend-compatible поле `ended_at` вместо наружного `finished_at`.
- `SummaryResponse` теперь возвращает `total_time_seconds_all_tasks`.
- `top_tasks` в summary теперь минимальные: `id`, `title`, `total_time_seconds`.
- `top_tasks` в summary фильтруются по `total_time_seconds > 0`.
- У задач добавлены `deadline` и `priority`; summary top tasks также возвращают эти поля.
- `GET /api/v1/tasks` поддерживает фильтры `priority`, `deadline_before`, `deadline_after`.
- `POST /api/v1/auth/login` теперь возвращает полный `UserProfile` в поле `user`, включая `created_at` и `stats`.
- Добавлен CORS middleware для `http://localhost:5173` и `http://127.0.0.1:5173`.
- Backend default port и docker compose default host port изменены на `8000`.
- Dockerfile и entrypoint приведены к fallback-порту `8000`.
- В `docker-compose.yml` прокинуты `JWT_*` и `ADMIN_*` переменные.
- Исправлен `500` в `POST /api/v1/tasks/{task_id}/timer/start` для несуществующей задачи: timer service больше не открывает вложенную транзакцию поверх session, уже использованной auth dependency.
- Обновлены backend `.env.example` и `.env.sample`.
- Добавлены тесты на frontend-compatible task/summary response и проверку запуска таймера только в рамках конкретной задачи.

## 6. Что было минимально изменено во frontend

- `server/frontend/.env.example`: `VITE_USE_MOCKS=false`.
- `server/frontend/src/shared/api/client.ts`: улучшена сборка headers, обработка `401`, `204` и backend JSON errors (`detail`, `error`, `message`).
- `DashboardPage`, `TaskRow`, `TaskDetailsModal`, `ProfilePage`, `ReportsPage`: добавлено отображение срока и компактного значка приоритета.
- `PriorityIcon`, `PrioritySelect`, `date` utils: добавлены для выбора и отображения новых task fields.
- `server/frontend/.gitignore`: добавлен `.vite/`.
- `server/frontend/README.md`: обновлено описание real/mock mode.

Основная GitHub Dark стилистика сохранена; изменения UI ограничены новыми полями задачи.

## 7. Проверка backend отдельно

| Проверка | Команда/endpoint | Результат | Комментарий |
|---|---|---|---|
| Unit/API tests | `PYTHONDONTWRITEBYTECODE=1 make test` | OK | `34 passed` |
| Typecheck | `PYTHONDONTWRITEBYTECODE=1 UV_CACHE_DIR=.uv-cache uv run --no-sync mypy src` | OK | `Success: no issues found in 35 source files` |
| Ruff lint | `PYTHONDONTWRITEBYTECODE=1 UV_CACHE_DIR=.uv-cache uv run --no-sync ruff check src tests` | OK | `All checks passed` |
| Ruff format check | `PYTHONDONTWRITEBYTECODE=1 UV_CACHE_DIR=.uv-cache uv run --no-sync ruff format --check src tests` | OK | `41 files already formatted` |
| Docker compose backend | `make run` | OK | Backend, PostgreSQL, Prometheus, Loki, Promtail, Grafana поднялись |
| Migrations | entrypoint `alembic upgrade head` | OK | Backend container стал `healthy`, `/health` вернул schema `ok` |
| Create admin | `docker compose exec -T backend python -m src.scripts.create_admin` | OK | Admin created / already exists |
| Health | `curl http://localhost:8000/health` | OK | `{"status":"ok","database":"ok","schema":"ok"}` |
| Metrics | `GET /metrics` | OK | Prometheus text response |

## 8. Проверка frontend отдельно

| Проверка | Команда | Результат | Комментарий |
|---|---|---|---|
| Install | `npm install --no-audit --no-fund` | OK | `up to date` |
| Typecheck | `npm run typecheck` | OK | TypeScript без ошибок |
| Build | `npm run build` | OK | Vite production build успешен |
| Lint | `npm run lint` | Not available | В `package.json` нет script `lint` |
| Dev server smoke | `npm run dev -- --host 127.0.0.1 --port 5173` | OK with port fallback | 5173 был занят, Vite поднялся на `5174`; `/auth`, `/dashboard`, `/profile`, `/reports` вернули `200 OK`; сервер остановлен |

## 9. Интеграционная проверка

| Сценарий | Результат | Комментарий |
|---|---|---|
| Запустить backend через compose | OK | `make run`, backend published `0.0.0.0:8000->8000` |
| Применить миграции | OK | `alembic upgrade head` выполнен entrypoint, `/health` schema `ok` |
| Запустить frontend dev server | OK | Vite поднялся на `127.0.0.1:5174`, потому что `5173` был занят |
| Проверить frontend HTML routes | OK | `/auth`, `/dashboard`, `/profile`, `/reports` вернули `HTTP/1.1 200 OK` |
| CORS preflight | OK | `OPTIONS /api/v1/tasks` с origin `http://localhost:5173` вернул `access-control-allow-origin` |
| Полный backend HTTP happy path с реальной БД | OK | 44/44 endpoint-сценария прошли |
| Deadline/priority live API path | OK | 15/15 сценариев прошли: create default, create with fields, filters, patch, timer, summary |
| Negative path с реальной БД | OK | Проверены 401, 403, 404, 409, 422 |
| Полный browser click-through | Частично | Автоматизированного браузера в проекте нет; проверены frontend dev routes и backend API |

## 10. Проверенные API-ручки

| Метод | Путь | JWT | Ожидаемый статус | Фактический статус | Результат |
|---|---|---:|---:|---:|---|
| GET | `/health` | Нет | 200 | 200 live + unit test | OK |
| GET | `/health` при неготовой схеме | Нет | 503 | 503 в unit test | OK |
| POST | `/api/v1/auth/register` | Нет | 201/409 | 201/409 live | OK |
| POST | `/api/v1/auth/login` | Нет | 200/401/403 | 200/401 live, 403 unit | OK |
| GET | `/api/v1/users/me` без token | Да | 401 | 401 live | OK |
| GET | `/api/v1/users/me` с invalid token | Да | 401 | 401 live | OK |
| PATCH | `/api/v1/users/me` | Да | 200 | 200 live | OK |
| GET | `/api/v1/users/me/activity` | Да | 200 | 200 live | OK |
| GET | `/api/v1/users/me/activity?year=2026` | Да | 200 | 200 live | OK |
| GET | `/api/v1/tasks` | Да | 200/401 | 200/401 live | OK |
| GET | `/api/v1/tasks?search=...` | Да | 200 | 200 live | OK |
| GET | `/api/v1/tasks?has_time=true` | Да | 200 | 200 live | OK |
| POST | `/api/v1/tasks` | Да | 201/422 | 201/422 live | OK |
| GET | `/api/v1/tasks/{task_id}` | Да | 200/404 | 200/404 live | OK |
| PATCH | `/api/v1/tasks/{task_id}` | Да | 200 | 200 live | OK |
| DELETE | `/api/v1/tasks/{task_id}` | Да | 204/404 | 204/404 live | OK |
| POST | `/api/v1/tasks/{task_id}/timer/start` | Да | 200/404/409 | 200/404/409 live | OK |
| POST | `/api/v1/tasks/{task_id}/timer/stop` | Да | 200/409 | 200/409 live | OK |
| GET | `/api/v1/summary?limit=3` | Да | 200 | 200 live | OK |
| GET | `/api/v1/admin/users` с user role | Admin | 403 | 403 live | OK |
| GET | `/api/v1/admin/users` с admin role | Admin | 200 | 200 live | OK |
| GET | `/api/v1/admin/users/{user_id}` | Admin | 200 | 200 live | OK |
| PATCH | `/api/v1/admin/users/{user_id}` | Admin | 200 | 200 live | OK |
| GET | `/api/v1/admin/users/{user_id}/activity` | Admin | 200 | 200 live | OK |
| GET | `/api/v1/admin/stats` | Admin | 200 | 200 live | OK |

Полная проверка live API через настоящую PostgreSQL: `TOTAL_OK=44/44`.

## 11. Исправленные расхождения

| Расхождение | Что было | Что стало |
|---|---|---|
| Task intervals | `intervals` | `time_intervals` |
| Interval end field | `finished_at` | `ended_at` |
| Summary total | `total_time_seconds` | `total_time_seconds_all_tasks` |
| Summary top tasks | Полный `TaskRead` | Минимальный `SummaryTask` |
| Summary zero tasks | В top могли попасть задачи с 0 секунд | Top содержит только задачи с временем |
| Login user object | `UserPublic` без статистики | `UserProfile` со `created_at` и `stats` |
| CORS | Не был настроен | Настроен через `CORS_ALLOW_ORIGINS` |
| Backend port | 8080 по умолчанию | 8000 по умолчанию |
| Frontend env | Mock mode по умолчанию | Real mode по умолчанию |
| Frontend errors | `Request failed` | Сообщение из backend `detail/error/message` |
| Timer transaction | `500 Internal Server Error` при start несуществующей задачи после JWT auth | Корректный `404 Not Found` |
| Docker admin env | `create_admin` падал без `ADMIN_EMAIL` внутри контейнера | `Admin user created` / `Admin user already exists` |
| Docker fallback port | Dockerfile/entrypoint указывали fallback `8080` | Fallback `8000` |

## 12. Найденные проблемы

1. Локальный `server/Backend/.env` переопределял backend port на `8080`.
   - Критичность: высокая для frontend-интеграции.
   - Исправление: локальный `.env` обновлен на `APP_PORT=8000`, `BACKEND_HOST_PORT=8000`, добавлен `CORS_ALLOW_ORIGINS`.
   - В git не коммитится, потому что `.env` содержит локальные секреты.

2. `create_admin` не работал внутри контейнера.
   - Критичность: средняя, блокирует admin API тесты.
   - Причина: compose не передавал `ADMIN_*` env в backend container.
   - Исправлено в `docker-compose.yml`.

3. `POST /api/v1/tasks/{task_id}/timer/start` возвращал `500` вместо `404` для несуществующей задачи.
   - Критичность: высокая.
   - Причина: вложенный `session.begin()` в timer service поверх session, уже использованной auth dependency.
   - Исправлено: timer service использует текущую session и явный `commit()`.

4. Порт frontend `5173` занят в текущем окружении.
   - Критичность: низкая.
   - Vite автоматически поднялся на `5174`.
   - Для стандартного запуска нужно освободить 5173 или использовать показанный Vite URL.

5. Frontend lint script отсутствует.
   - Критичность: низкая.
   - `package.json` содержит `dev`, `build`, `preview`, `typecheck`, но не `lint`.

## 13. Что не удалось проверить

- Автоматический browser click-through с реальным DOM, localStorage и кликами по UI.

Причина: в проекте нет Playwright/Cypress/другого браузерного тест-раннера. Заменено на production build, Vite route smoke, CORS preflight и полный live backend API сценарий.

## 14. Итоговое состояние

- Backend-контракты адаптированы под текущий frontend.
- У задач есть `deadline` и `priority`, они проходят через API, frontend и summary.
- Frontend по умолчанию настроен на real mode: `VITE_USE_MOCKS=false`.
- API client корректнее обрабатывает headers, `401`, `204` и JSON errors.
- Backend unit/API tests, mypy, ruff и format check проходят.
- Frontend install, typecheck и build проходят.
- Docker compose backend/PostgreSQL запускается, `/health` и `/metrics` работают.
- Live API integration с PostgreSQL прошел: `44/44`; дополнительная проверка deadline/priority прошла `15/15`.
- CORS preflight для frontend origin работает.

## 15. Рекомендации

1. Перед деплоем заменить локальный `JWT_SECRET_KEY` на production secret через переменные окружения.
2. Не коммитить `server/Backend/.env`; использовать `.env.example`/секреты окружения.
3. Добавить Playwright/Cypress smoke tests, если нужен автоматический browser click-through.
4. Добавить frontend lint script, если требуется обязательная frontend lint-проверка.
