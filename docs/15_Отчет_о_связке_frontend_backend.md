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
- `POST /api/v1/auth/login` теперь возвращает полный `UserProfile` в поле `user`, включая `created_at` и `stats`.
- Добавлен CORS middleware для `http://localhost:5173` и `http://127.0.0.1:5173`.
- Backend default port и docker compose default host port изменены на `8000`.
- Обновлены backend `.env.example` и `.env.sample`.
- Добавлены тесты на frontend-compatible task/summary response и проверку запуска таймера только в рамках конкретной задачи.

## 6. Что было минимально изменено во frontend

- `server/frontend/.env.example`: `VITE_USE_MOCKS=false`.
- `server/frontend/src/shared/api/client.ts`: улучшена сборка headers, обработка `401`, `204` и backend JSON errors (`detail`, `error`, `message`).
- `server/frontend/.gitignore`: добавлен `.vite/`.
- `server/frontend/README.md`: обновлено описание real/mock mode.

UI-компоненты, CSS-верстка и страницы не менялись.

## 7. Проверка backend отдельно

| Проверка | Команда/endpoint | Результат | Комментарий |
|---|---|---|---|
| Unit/API tests | `PYTHONDONTWRITEBYTECODE=1 make test` | OK | `30 passed` |
| Typecheck | `PYTHONDONTWRITEBYTECODE=1 UV_CACHE_DIR=.uv-cache uv run --no-sync mypy src` | OK | `Success: no issues found in 35 source files` |
| Ruff lint | `PYTHONDONTWRITEBYTECODE=1 UV_CACHE_DIR=.uv-cache uv run --no-sync ruff check src tests` | OK | `All checks passed` |
| Ruff format check | `PYTHONDONTWRITEBYTECODE=1 UV_CACHE_DIR=.uv-cache uv run --no-sync ruff format --check src tests` | OK | `41 files already formatted` |
| Docker compose backend | `make run` | Failed by environment | Docker daemon is not running: отсутствует `/Users/oleg/.docker/run/docker.sock` |
| Migrations | `PYTHONDONTWRITEBYTECODE=1 make upgrade` | Failed by environment | PostgreSQL на `localhost:5433` не запущен: connection refused |

## 8. Проверка frontend отдельно

| Проверка | Команда | Результат | Комментарий |
|---|---|---|---|
| Install | `npm install --no-audit --no-fund` | OK | `up to date` |
| Typecheck | `npm run typecheck` | OK | TypeScript без ошибок |
| Build | `npm run build` | OK | Vite production build успешен |
| Lint | `npm run lint` | Not available | В `package.json` нет script `lint` |
| Dev server smoke | `npm run dev -- --host 127.0.0.1 --port 5173` | OK with port fallback | 5173 был занят, Vite поднялся на `5174`; `GET /auth` вернул `200 OK`; сервер остановлен |

## 9. Интеграционная проверка

| Сценарий | Результат | Комментарий |
|---|---|---|
| Запустить backend через compose | Не выполнено полностью | Docker daemon не запущен в окружении |
| Применить миграции | Не выполнено полностью | PostgreSQL на `localhost:5433` недоступен |
| Запустить frontend dev server | OK | Vite поднялся на `127.0.0.1:5174`, потому что `5173` был занят |
| Проверить frontend HTML route `/auth` | OK | `HTTP/1.1 200 OK` |
| Полный browser happy path с реальной БД | Не удалось проверить | Нужен запущенный Docker/PostgreSQL/backend |
| Negative path с реальной БД | Не удалось проверить | Нужен запущенный Docker/PostgreSQL/backend |

## 10. Проверенные API-ручки

| Метод | Путь | JWT | Ожидаемый статус | Фактический статус | Результат |
|---|---|---:|---:|---:|---|
| GET | `/health` | Нет | 200 | 200 в unit test | OK |
| GET | `/health` при неготовой схеме | Нет | 503 | 503 в unit test | OK |
| POST | `/api/v1/auth/register` | Нет | 201/409 | Проверено service tests | OK |
| POST | `/api/v1/auth/login` | Нет | 200/401/403 | Проверено service tests | OK |
| GET | `/api/v1/users/me` без token | Да | 401 | 401 в API test | OK |
| GET | `/api/v1/users/me` с invalid token | Да | 401 | 401 в API test | OK |
| GET | `/api/v1/tasks` | Да | 200 | 200 в API test | OK |
| GET | `/api/v1/tasks?search=...&has_time=true` | Да | 200 | 200 в API test | OK |
| DELETE | `/api/v1/tasks/{task_id}` not found | Да | 404 | 404 в API test | OK |
| POST | `/api/v1/tasks/{task_id}/timer/start` | Да | 200/409 | Проверено service tests | OK |
| POST | `/api/v1/tasks/{task_id}/timer/stop` | Да | 200/409 | Проверено service tests | OK |
| GET | `/api/v1/summary?limit=3` | Да | 200 | 200 в API test | OK |
| GET | `/api/v1/admin/users` с user role | Admin | 403 | 403 в API test | OK |
| GET | `/api/v1/admin/users` с admin role | Admin | 200 | 200 в API test | OK |
| GET | `/api/v1/admin/users/{user_id}/activity` | Admin | 200 | 200 в API test | OK |
| GET | `/api/v1/admin/stats` | Admin | 200 | 200 в API test | OK |

Полная проверка этих ручек через настоящую PostgreSQL не выполнена из-за недоступного Docker/PostgreSQL.

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

## 12. Найденные проблемы

1. Docker daemon не запущен.
   - Критичность: блокирует полноценное интеграционное тестирование.
   - Фактический результат: `failed to connect to the docker API ... docker.sock: no such file or directory`.
   - Нужно действие окружения: запустить Docker Desktop или другой Docker daemon.

2. PostgreSQL на `localhost:5433` не запущен.
   - Критичность: блокирует `make upgrade` и реальные API-запросы к backend.
   - Фактический результат: `Connect call failed ('127.0.0.1', 5433)`.
   - Нужно действие окружения: поднять PostgreSQL через compose или локально.

3. Порт frontend `5173` был занят во время smoke-проверки.
   - Критичность: низкая.
   - Vite автоматически поднялся на `5174`.
   - Нужно при необходимости остановить процесс на 5173 или явно использовать свободный порт.

4. Frontend lint script отсутствует.
   - Критичность: низкая.
   - `package.json` содержит `dev`, `build`, `preview`, `typecheck`, но не `lint`.

## 13. Что не удалось проверить

- Реальную регистрацию через HTTP с записью в PostgreSQL.
- Реальный login с получением JWT через запущенный backend.
- Полный сценарий dashboard create/search/details/start/stop/delete через браузер и реальную БД.
- Полный сценарий profile/activity/reports через браузер и реальную БД.
- Admin endpoint через реального администратора.
- Network/CORS в браузере против реально запущенного backend.

Причина: Docker daemon и PostgreSQL недоступны в текущем окружении.

## 14. Итоговое состояние

- Backend-контракты адаптированы под текущий frontend.
- Frontend по умолчанию настроен на real mode: `VITE_USE_MOCKS=false`.
- API client корректнее обрабатывает headers, `401`, `204` и JSON errors.
- Backend unit/API tests, mypy, ruff и format check проходят.
- Frontend install, typecheck и build проходят.
- Полная интеграционная проверка требует запущенных Docker/PostgreSQL.

## 15. Рекомендации

1. Запустить Docker daemon.
2. Выполнить `cd server/Backend && make run`.
3. Проверить `http://localhost:8000/health`.
4. Выполнить `cd server/frontend && npm run dev`.
5. Пройти browser happy path из раздела 9 после поднятия backend.
6. Добавить frontend lint script, если требуется обязательная frontend lint-проверка.
