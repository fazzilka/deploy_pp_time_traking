from fastapi import APIRouter

from src.api.v1 import admin, auth, summary, tasks, users

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth.router)
api_v1_router.include_router(users.router)
api_v1_router.include_router(tasks.router)
api_v1_router.include_router(summary.router)
api_v1_router.include_router(admin.router)
