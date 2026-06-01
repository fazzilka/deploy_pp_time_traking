# Расхождения frontend и backend

Документ создан перед правками backend. Главный принцип интеграции: backend адаптируется под текущий frontend-контракт.

| Раздел | Frontend ожидает | Backend сейчас делает | Решение |
|---|---|---|---|
| Tasks response | Поле `time_intervals` | Было поле `intervals` | Исправлено: `TaskRead` возвращает `time_intervals` |
| Time interval response | Поле `ended_at` | Было поле `finished_at` | Исправлено: `TimeIntervalRead` возвращает `ended_at` |
| Active timer restore | `time_intervals[].ended_at === null` в списке задач | Активный интервал приходил как `intervals[].finished_at === null` | Исправлено для task list/detail/start/stop |
| Summary total | `total_time_seconds_all_tasks` | Было `total_time_seconds` | Исправлено: `/api/v1/summary` возвращает frontend-compatible поле |
| Summary top tasks | Минимальные элементы `id`, `title`, `total_time_seconds` | Возвращался полный `TaskRead` | Исправлено: добавлен `SummaryTask` |
| CORS | Browser-запросы с `http://localhost:5173` | CORS middleware отсутствовал | Исправлено: добавлен CORS middleware с dev origins через settings |
| Порт backend | `VITE_API_URL=http://localhost:8000` | Docker/backend default был `8080` | Исправлено: backend/docker default port `8000` |
| Mock mode | Для связки нужен `VITE_USE_MOCKS=false` | `.env.example` содержал `VITE_USE_MOCKS=true` | Исправлено: frontend `.env.example` переключен на real mode |
| Ошибки API frontend | Желательно показывать `detail` backend | `apiRequest` бросал только `Request failed` | Исправлено: `apiRequest` читает `detail/error/message` |
| 204 frontend | Нужно не читать JSON на `204` | Уже обработано | Оставить и проверить |
| JWT | `Authorization: Bearer <access_token>` | Backend требует JWT на защищенных endpoint | Совместимо |
| Auth endpoints | `/api/v1/auth/register`, `/api/v1/auth/login` | Такие endpoint есть | Совместимо |
| Login user object | Если `user` есть, frontend-тип ожидает полный `User` со `stats` | Был `UserPublic` без `created_at/stats` | Исправлено: login возвращает `UserProfile` |
| Profile endpoints | `/api/v1/users/me`, `/api/v1/users/me/activity` | Такие endpoint есть | Совместимо |
| Multiple timers | Разные задачи могут иметь активные таймеры одновременно | Проверка идет только по `task_id` | Совместимо, добавлен тест |
| Timer start/stop under JWT | Endpoint должен работать после auth dependency | На реальном HTTP был `500` из-за вложенного `session.begin()` после auth-запроса | Исправлено: timer service использует текущую session и явный `commit()` |
| Admin bootstrap in Docker | `create_admin` должен работать в контейнере | Compose не передавал `ADMIN_*` env в backend | Исправлено: `ADMIN_*` прокинуты в `docker-compose.yml` |
| Docker runtime port | Backend должен быть на `8000` | Dockerfile/entrypoint fallback оставались на `8080` | Исправлено: Dockerfile `EXPOSE 8000`, entrypoint fallback `8000` |
| Task deadline | Frontend показывает и отправляет `deadline` | Поля в backend не было | Добавлены column, schema, migration, UI и API examples |
| Task priority | Frontend показывает маленький priority icon и отправляет `priority` | Поля в backend не было | Добавлен `TaskPriority`, default `medium`, фильтр и отображение |
| Task filters | Frontend/API контракту нужны `priority`, `deadline_before`, `deadline_after` | Были только `search`, `has_time` | Добавлены query params в `GET /api/v1/tasks` |
| Summary top task metadata | Reports/Profile показывают priority icon в top tasks | Summary отдавал только `id/title/total_time_seconds` | `SummaryTask` теперь включает `deadline` и `priority` |
