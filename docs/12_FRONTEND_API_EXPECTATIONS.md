# API-контракты, ожидаемые frontend

Источник: `server/frontend/src/shared/api`, `server/frontend/src/shared/types`, страницы `AuthPage`, `DashboardPage`, `ProfilePage`, `ReportsPage`, компоненты `ProtectedRoute`, `Navigation`.

## 1. Общие правила

- Базовый URL берется из `VITE_API_URL`, локально ожидается `http://localhost:8000`.
- Mock-режим управляется `VITE_USE_MOCKS`; для реального backend нужно `VITE_USE_MOCKS=false`.
- JWT хранится в `localStorage` под ключом `access_token`.
- Все реальные запросы через `apiRequest` должны добавлять `Authorization: Bearer <access_token>`, если token есть.
- При `401` frontend удаляет `access_token` и перенаправляет пользователя на `/auth`.
- `204 No Content` должен обрабатываться без попытки читать JSON.

## 2. Auth

### POST /api/v1/auth/register

Frontend отправляет:

```json
{
  "email": "user@example.com",
  "username": "dmitry",
  "full_name": "Дмитрий",
  "password": "password123"
}
```

Frontend ожидает `AuthResponse`, где token может отсутствовать. Если `access_token` есть, пользователь сразу попадает на `/dashboard`; если token нет, frontend показывает сообщение `Аккаунт создан, теперь войдите`.

```ts
type AuthResponse = {
  access_token: string;
  token_type: "bearer";
  user?: User;
};
```

Где используется: `server/frontend/src/shared/api/auth.ts`, `server/frontend/src/pages/AuthPage/AuthPage.tsx`.

### POST /api/v1/auth/login

Frontend отправляет:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Frontend ожидает:

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

Поле `user` опционально для frontend, но если оно есть, форма авторизации его принимает.

Где используется: `server/frontend/src/shared/api/auth.ts`, `server/frontend/src/pages/AuthPage/AuthPage.tsx`.

## 3. User/Profile

### GET /api/v1/users/me

JWT: требуется.

Frontend ожидает:

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

Где используется: `server/frontend/src/shared/api/profile.ts`, `Navigation`, `ProfilePage`.

### PATCH /api/v1/users/me

JWT: требуется.

Frontend отправляет:

```json
{
  "username": "dmitry_new",
  "full_name": "Дмитрий Иванов"
}
```

Frontend ожидает обновленный `User` в том же формате, что `GET /api/v1/users/me`.

Где используется: `server/frontend/src/shared/api/profile.ts`, `ProfilePage`.

### GET /api/v1/users/me/activity?year=2026

JWT: требуется.

Frontend ожидает:

```json
{
  "year": 2026,
  "days": [
    {
      "date": "2026-01-01",
      "intervals_count": 0,
      "total_time_seconds": 0,
      "level": 0
    }
  ],
  "summary": {
    "active_days_count": 0,
    "current_streak_days": 0,
    "max_streak_days": 0,
    "total_intervals_count": 0,
    "total_time_seconds": 0
  }
}
```

`year` в frontend-типе отсутствует, но лишнее поле не ломает UI.

Где используется: `server/frontend/src/shared/api/profile.ts`, `ProfilePage`, `ReportsPage`.

## 4. Tasks

### GET /api/v1/tasks

JWT: требуется.

Query params:

- `search` для поиска по названию;
- `has_time=true` для фильтра задач с накопленным временем.

Frontend ожидает массив:

```json
[
  {
    "id": 1,
    "title": "Сделать таймер",
    "description": "Описание",
    "total_time_seconds": 5050,
    "created_at": "2026-05-18T10:00:00Z",
    "updated_at": "2026-05-18T10:00:00Z",
    "time_intervals": [
      {
        "id": 10,
        "started_at": "2026-05-18T10:00:00Z",
        "ended_at": null
      }
    ]
  }
]
```

Критично для UI: `time_intervals[].ended_at === null` используется для восстановления активных таймеров после загрузки страницы.

Где используется: `server/frontend/src/shared/api/tasks.ts`, `DashboardPage`, `ProfilePage`, `ReportsPage`.

### GET /api/v1/tasks/{task_id}

JWT: требуется.

Frontend ожидает одну задачу в том же формате, что в списке. В текущем UI подробности задачи открываются из уже загруженного списка, но endpoint входит в ожидаемый контракт.

### POST /api/v1/tasks

JWT: требуется.

Frontend отправляет:

```json
{
  "title": "Новая задача",
  "description": "Описание"
}
```

Frontend ожидает созданную задачу в формате `Task`.

### PATCH /api/v1/tasks/{task_id}

JWT: требуется.

Frontend-слой готов к обновлению задачи, хотя текущий UI почти не использует этот сценарий. Ожидаемый response: обновленная `Task`.

### DELETE /api/v1/tasks/{task_id}

JWT: требуется.

Frontend ожидает `204 No Content`.

### POST /api/v1/tasks/{task_id}/timer/start

JWT: требуется.

Frontend ожидает обновленную `Task` с активным интервалом:

```json
{
  "id": 1,
  "title": "Задача",
  "description": "Описание",
  "total_time_seconds": 0,
  "time_intervals": [
    {
      "id": 22,
      "started_at": "2026-05-18T10:15:00Z",
      "ended_at": null
    }
  ]
}
```

Повторный start у той же задачи должен вернуть `409`.

### POST /api/v1/tasks/{task_id}/timer/stop

JWT: требуется.

Frontend ожидает обновленную `Task` с закрытым интервалом и актуальным `total_time_seconds`.

## 5. Summary/Reports

### GET /api/v1/summary

JWT: требуется.

Frontend ожидает:

```json
{
  "total_time_seconds_all_tasks": 2220,
  "top_tasks": [
    {
      "id": 1,
      "title": "Авторизация и профиль",
      "total_time_seconds": 15120
    }
  ]
}
```

`ReportsPage` дополнительно ограничивает отображение топа задач до 3 элементов через `slice(0, 3)`.

### GET /api/v1/summary?limit=3

Frontend напрямую сейчас вызывает `/api/v1/summary` без `limit`, но backend должен поддерживать `limit`, чтобы контракт отчетов и профиля мог ограничивать топ задач на уровне API.

## 6. Admin

Admin UI во frontend отсутствует, но backend-ручки проверяются отдельно:

- `GET /api/v1/admin/users`;
- `GET /api/v1/admin/users/{user_id}`;
- `PATCH /api/v1/admin/users/{user_id}`;
- `GET /api/v1/admin/users/{user_id}/activity`;
- `GET /api/v1/admin/stats`.
