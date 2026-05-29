# Time Tracking Frontend

Frontend for the Time Tracking project. The app is built with React, TypeScript, Vite and React Router.

## Stack

- React
- TypeScript
- Vite
- React Router
- Component CSS files
- Fetch API-ready service layer

## Run

```bash
npm install
npm run dev
npm run build
```

## Environment

Create `.env` from `.env.example` when local overrides are needed.

```env
VITE_API_URL=http://localhost:8000
VITE_USE_MOCKS=true
```

`VITE_USE_MOCKS=true` keeps the UI fully usable without a backend. Set it to `false` when the backend API is ready.

## Pages

- `/auth` - sign in and registration.
- `/dashboard` - active timer and task queue.
- `/profile` - profile, generated avatar and yearly activity grid.
- `/reports` - time reports, weekly chart, top tasks and activity strip.

## Backend Integration

The API files under `src/shared/api` already mirror the expected backend endpoints:

- auth: `/api/v1/auth/login`, `/api/v1/auth/register`
- user: `/api/v1/users/me`, `/api/v1/users/me/activity`
- tasks: `/api/v1/tasks`, `/api/v1/tasks/{task_id}/timer/start`, `/api/v1/tasks/{task_id}/timer/stop`
- summary: `/api/v1/summary`

JWT is stored in `localStorage` under `access_token` and attached as `Authorization: Bearer <token>` by `apiRequest`.
