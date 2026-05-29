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
| Multiple timers | Разные задачи могут иметь активные таймеры одновременно | Проверка идет только по `task_id` | Совместимо, добавить/обновить тест |
