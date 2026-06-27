from fastapi import APIRouter, Depends

from src.api.deps import bind_vault_token
from src.api.v1 import (
    admin,
    auth,
    events,
    notifications,
    projects,
    protected_space,
    summary,
    tasks,
    users,
    workspaces,
)

api_v1_router = APIRouter(prefix="/api/v1", dependencies=[Depends(bind_vault_token)])
api_v1_router.include_router(auth.router)
api_v1_router.include_router(users.router)
api_v1_router.include_router(workspaces.router)
api_v1_router.include_router(protected_space.router)
api_v1_router.include_router(events.router)
api_v1_router.include_router(notifications.router)
api_v1_router.include_router(tasks.router)
api_v1_router.include_router(projects.router)
api_v1_router.include_router(summary.router)
api_v1_router.include_router(admin.router)
