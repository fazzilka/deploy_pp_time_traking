from fastapi import APIRouter

from src.api.v1 import summary, tasks

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(tasks.router)
api_v1_router.include_router(summary.router)
