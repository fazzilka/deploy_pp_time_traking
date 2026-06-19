from fastapi import APIRouter

from src.api.v1 import admin, auth, notifications, projects, summary, tasks, users, workspaces

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth.router)
api_v1_router.include_router(users.router)
api_v1_router.include_router(workspaces.router)
api_v1_router.include_router(notifications.router)
api_v1_router.include_router(tasks.router)
api_v1_router.include_router(projects.router)
api_v1_router.include_router(summary.router)
api_v1_router.include_router(admin.router)
