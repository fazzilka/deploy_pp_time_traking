from typing import Annotated

from fastapi import APIRouter, Query

from src.api.deps import CurrentUserDep, SessionDep
from src.models.notification import Notification
from src.schemas.notification import (
    NotificationListResponse,
    NotificationMarkAllReadResponse,
    NotificationRead,
    NotificationUnreadCountResponse,
)
from src.services.notification import (
    get_unread_count,
    list_user_notifications,
    mark_all_as_read,
    mark_as_read_or_404,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
async def get_notifications(
    session: SessionDep,
    current_user: CurrentUserDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    unread_only: Annotated[bool, Query()] = False,
) -> NotificationListResponse:
    items, total, unread_count = await list_user_notifications(
        session,
        user_id=current_user.id,
        limit=limit,
        offset=offset,
        unread_only=unread_only,
    )
    return NotificationListResponse(
        items=[NotificationRead.model_validate(item) for item in items],
        total=total,
        unread_count=unread_count,
    )


@router.get("/unread-count", response_model=NotificationUnreadCountResponse)
async def get_notifications_unread_count(
    session: SessionDep,
    current_user: CurrentUserDep,
) -> NotificationUnreadCountResponse:
    unread_count = await get_unread_count(session, user_id=current_user.id)
    return NotificationUnreadCountResponse(unread_count=unread_count)


@router.patch("/{notification_id}/read", response_model=NotificationRead)
async def patch_notification_read(
    notification_id: int,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> Notification:
    return await mark_as_read_or_404(
        session,
        user_id=current_user.id,
        notification_id=notification_id,
    )


@router.patch("/read-all", response_model=NotificationMarkAllReadResponse)
async def patch_notifications_read_all(
    session: SessionDep,
    current_user: CurrentUserDep,
) -> NotificationMarkAllReadResponse:
    updated_count = await mark_all_as_read(session, user_id=current_user.id)
    return NotificationMarkAllReadResponse(updated_count=updated_count)
