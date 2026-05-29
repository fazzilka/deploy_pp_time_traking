# Фактические API-контракты backend

Источник: `server/Backend/src/main.py`, `server/Backend/src/api/v1`, `server/Backend/src/schemas`, `server/Backend/src/services`.

Документ фиксирует фактическое состояние backend после адаптации под frontend-контракт.

## 1. Health и metrics

### GET /health

JWT: не требуется.

Response:

```json
{
  "status": "ok",
  "database": "ok",
  "schema": "ok"
}
```

Проверяет наличие таблиц `tasks`, `time_intervals`, `users`.

Источник: `server/Backend/src/main.py`, функция `health`.

### GET /metrics

JWT: не требуется.

Prometheus metrics создаются через `prometheus_fastapi_instrumentator`.

Источник: `server/Backend/src/main.py`.

## 2. Auth

### POST /api/v1/auth/register

JWT: не требуется.

Request schema: `RegisterRequest`.

```json
{
  "email": "user@example.com",
  "username": "dmitry",
  "password": "password123",
  "full_name": "Дмитрий"
}
```

Response model: `UserPublic`.

```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "dmitry",
  "full_name": "Дмитрий",
  "role": "user",
  "is_active": true,
  "avatar_letter": "Д"
}
```

Ошибки: `409` при занятых email или username, `422` при невалидном body.

Источник: `server/Backend/src/api/v1/auth.py`, `register`; `server/Backend/src/services/auth.py`, `register_user`.

### POST /api/v1/auth/login

JWT: не требуется.

Request schema: `LoginRequest`.

Response model: `TokenResponse`.

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "dmitry",
    "full_name": "Дмитрий",
    "role": "user",
    "is_active": true,
    "avatar_letter": "Д",
    "created_at": "2026-05-18T10:00:00Z",
    "stats": {
      "tasks_count": 0,
      "tasks_with_time_count": 0,
      "total_time_seconds": 0,
      "current_streak_days": 0,
      "max_streak_days": 0
    }
  }
}
```

Ошибки: `401` при неверных учетных данных, `403` если пользователь неактивен.

Источник: `server/Backend/src/api/v1/auth.py`, `login`; `server/Backend/src/services/auth.py`, `login_user`.

## 3. Users/Profile

### GET /api/v1/users/me

JWT: требуется.

Response model: `UserProfile`.

```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "dmitry",
  "full_name": "Дмитрий",
  "role": "user",
  "is_active": true,
  "avatar_letter": "Д",
  "created_at": "2026-05-18T10:00:00Z",
  "stats": {
    "tasks_count": 12,
    "tasks_with_time_count": 7,
    "total_time_seconds": 18420,
    "current_streak_days": 4,
    "max_streak_days": 16
  }
}
```

Источник: `server/Backend/src/api/v1/users.py`, `get_me`; `server/Backend/src/services/user.py`, `get_user_profile`.

### PATCH /api/v1/users/me

JWT: требуется.

Request schema: `UserUpdate`, допускает `username`, `full_name`.

Response model: `UserProfile`.

Источник: `server/Backend/src/api/v1/users.py`, `update_me`.

### GET /api/v1/users/me/activity?year=2026

JWT: требуется.

Response model: `ActivityResponse`.

Возвращает все дни выбранного года или последние 365 дней, если `year` не передан. Учитывает только закрытые интервалы.

Источник: `server/Backend/src/api/v1/users.py`, `get_my_activity`; `server/Backend/src/services/user.py`, `get_activity`.

## 4. Tasks

Все task endpoint требуют JWT и работают только с задачами текущего пользователя.

### GET /api/v1/tasks

Query params:

- `search: str | None`;
- `has_time: bool | None`.

Response model: `list[TaskRead]`.

Фактическая структура:

```json
[
  {
    "id": 1,
    "title": "Задача",
    "description": "",
    "total_time_seconds": 5,
    "created_at": null,
    "updated_at": null,
    "time_intervals": [
      {
        "id": 1,
        "started_at": "2026-05-18T10:00:00Z",
        "ended_at": null
      }
    ]
  }
]
```

Источник: `server/Backend/src/api/v1/tasks.py`, `list_tasks`; `server/Backend/src/schemas/task.py`.

### GET /api/v1/tasks/{task_id}

JWT: требуется.

Response model: `TaskRead`.

Источник: `server/Backend/src/api/v1/tasks.py`, `get_task`.

### POST /api/v1/tasks

JWT: требуется.

Request schema: `TaskCreate`.

Response: `201 Created`, `TaskRead`.

Источник: `server/Backend/src/api/v1/tasks.py`, `create_task`.

### PATCH /api/v1/tasks/{task_id}

JWT: требуется.

Request schema: `TaskUpdate`.

Response model: `TaskRead`.

Источник: `server/Backend/src/api/v1/tasks.py`, `update_task`.

### DELETE /api/v1/tasks/{task_id}

JWT: требуется.

Response: `204 No Content`.

Источник: `server/Backend/src/api/v1/tasks.py`, `delete_task`.

### POST /api/v1/tasks/{task_id}/timer/start

JWT: требуется.

Response model: `TaskRead`.

Правило: у одной задачи не может быть более одного активного интервала. Активные таймеры у других задач не блокируются.

Ошибки: `404`, если задача не найдена; `409`, если у этой задачи уже есть активный интервал.

Источник: `server/Backend/src/api/v1/tasks.py`, `start_task_timer`; `server/Backend/src/services/timer.py`, `start_timer`.

### POST /api/v1/tasks/{task_id}/timer/stop

JWT: требуется.

Response model: `TaskRead`.

Ошибки: `404`, если задача не найдена; `409`, если у этой задачи нет активного интервала.

Источник: `server/Backend/src/api/v1/tasks.py`, `stop_task_timer`; `server/Backend/src/services/timer.py`, `stop_timer`.

## 5. Summary

### GET /api/v1/summary?limit=10

JWT: требуется.

Response model: `SummaryResponse`.

Фактическая структура:

```json
{
  "total_time_seconds_all_tasks": 2220,
  "top_tasks": [
    {
      "id": 1,
      "title": "Задача",
      "total_time_seconds": 2220
    }
  ]
}
```

`top_tasks` содержит только задачи с `total_time_seconds > 0`, отсортированные по убыванию времени и ограниченные query-параметром `limit`.

Источник: `server/Backend/src/api/v1/summary.py`, `get_summary`; `server/Backend/src/schemas/summary.py`.

## 6. Admin

Все admin endpoint требуют JWT пользователя с ролью `admin`.

### GET /api/v1/admin/users

Query params: `search`, `role`, `is_active`, `limit`, `offset`.

Response model: `AdminUserListResponse`.

### GET /api/v1/admin/users/{user_id}

Response model: `UserProfile`.

### PATCH /api/v1/admin/users/{user_id}

Request schema: `AdminUserUpdate`.

Response model: `UserProfile`.

### GET /api/v1/admin/users/{user_id}/activity?year=2026

Response model: `ActivityResponse`.

### GET /api/v1/admin/stats

Response model: `AdminSystemStats`.

Источник: `server/Backend/src/api/v1/admin.py`, `server/Backend/src/services/admin.py`.

## 7. Конфигурация

- Backend app default port в `Settings`: `8000`.
- Docker compose default host port: `8000`.
- CORS middleware разрешает dev origins из `CORS_ALLOW_ORIGINS`, по умолчанию `http://localhost:5173,http://127.0.0.1:5173`.
