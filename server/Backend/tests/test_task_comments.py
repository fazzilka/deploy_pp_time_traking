from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from src.models.enums import WorkspaceRole
from src.models.task_comment import TaskComment
from src.models.user import User
from src.schemas.task_comment import TaskCommentRead
from src.services import task_comments
from tests.conftest import DummyResult, DummySession

NOW = datetime(2026, 7, 6, 12, 0, tzinfo=UTC)


def _membership(role: WorkspaceRole) -> SimpleNamespace:
    return SimpleNamespace(role=role)


def _task() -> SimpleNamespace:
    return SimpleNamespace(id=10, workspace_id=7)


def _fake_load(role: WorkspaceRole):
    async def load(*_args):
        return _task(), _membership(role)

    return load


def _author(user_id: int = 1) -> User:
    return User(
        id=user_id,
        email=f"user{user_id}@example.com",
        username=f"user{user_id}",
        full_name=f"User {user_id}",
        hashed_password="hash",
        avatar_seed="seed",
    )


def _comment(
    *,
    comment_id: int = 100,
    author_id: int = 1,
    body: str = "Комментарий",
    deleted: bool = False,
) -> TaskComment:
    return TaskComment(
        id=comment_id,
        task_id=10,
        workspace_id=7,
        author_id=author_id,
        author=_author(author_id),
        body=body,
        created_at=NOW,
        deleted_at=NOW if deleted else None,
        deleted_by_id=1 if deleted else None,
    )


@pytest.mark.parametrize("body", ["", "   "])
@pytest.mark.asyncio
async def test_create_comment_rejects_blank_body(
    monkeypatch: pytest.MonkeyPatch,
    body: str,
) -> None:
    session = DummySession()
    monkeypatch.setattr(
        task_comments,
        "_load_task_and_membership",
        _fake_load(WorkspaceRole.MEMBER),
    )

    with pytest.raises(HTTPException) as exc:
        await task_comments.create_task_comment(session, 1, 10, body)

    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_viewer_cannot_create_comment(monkeypatch: pytest.MonkeyPatch) -> None:
    session = DummySession()
    monkeypatch.setattr(
        task_comments,
        "_load_task_and_membership",
        _fake_load(WorkspaceRole.VIEWER),
    )

    with pytest.raises(HTTPException) as exc:
        await task_comments.create_task_comment(session, 1, 10, "text")

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_create_comment_commits_before_event_and_payload_has_no_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = DummySession()
    created = _comment(body="private text")
    session.execute_results = [
        DummyResult(scalar_one=0),
        DummyResult(scalar_one=created),
    ]
    events: list[dict[str, object]] = []
    monkeypatch.setattr(
        task_comments,
        "_load_task_and_membership",
        _fake_load(WorkspaceRole.MEMBER),
    )

    async def fake_publish(_session, workspace_id, event, data):
        assert session.committed is True
        assert workspace_id == 7
        assert event == "task_comment_created"
        assert "body" not in data
        events.append(data)

    monkeypatch.setattr(task_comments, "publish_workspace_event", fake_publish)

    response = await task_comments.create_task_comment(session, 1, 10, "private text")

    assert response.body == "private text"
    assert events == [{"task_id": 10, "comment_id": 100}]


@pytest.mark.asyncio
async def test_member_can_update_own_comment(monkeypatch: pytest.MonkeyPatch) -> None:
    session = DummySession()
    comment = _comment(author_id=1)
    session.execute_results = [DummyResult(scalar_one_or_none=comment)]
    monkeypatch.setattr(
        task_comments,
        "_load_task_and_membership",
        _fake_load(WorkspaceRole.MEMBER),
    )
    monkeypatch.setattr(task_comments, "publish_workspace_event", _noop_event)

    response = await task_comments.update_task_comment(session, 1, 10, 100, "Обновлено")

    assert response.body == "Обновлено"
    assert response.updated_at is not None


@pytest.mark.asyncio
async def test_member_cannot_update_or_delete_other_comment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        task_comments,
        "_load_task_and_membership",
        _fake_load(WorkspaceRole.MEMBER),
    )

    update_session = DummySession()
    update_session.execute_results = [DummyResult(scalar_one_or_none=_comment(author_id=2))]
    with pytest.raises(HTTPException) as update_exc:
        await task_comments.update_task_comment(update_session, 1, 10, 100, "Обновлено")
    assert update_exc.value.status_code == 403

    delete_session = DummySession()
    delete_session.execute_results = [DummyResult(scalar_one_or_none=_comment(author_id=2))]
    with pytest.raises(HTTPException) as delete_exc:
        await task_comments.delete_task_comment(delete_session, 1, 10, 100)
    assert delete_exc.value.status_code == 403


@pytest.mark.parametrize("role", [WorkspaceRole.OWNER, WorkspaceRole.TEAM_LEAD])
@pytest.mark.asyncio
async def test_owner_and_team_lead_can_soft_delete_other_comment(
    monkeypatch: pytest.MonkeyPatch,
    role: WorkspaceRole,
) -> None:
    session = DummySession()
    comment = _comment(author_id=2, body="hidden body")
    session.execute_results = [DummyResult(scalar_one_or_none=comment)]
    monkeypatch.setattr(
        task_comments,
        "_load_task_and_membership",
        _fake_load(role),
    )
    monkeypatch.setattr(task_comments, "publish_workspace_event", _noop_event)

    response = await task_comments.delete_task_comment(session, 1, 10, 100)

    assert comment.deleted_at is not None
    assert comment.deleted_by_id == 1
    assert response.body is None
    assert response.is_deleted is True


@pytest.mark.asyncio
async def test_deleted_comment_cannot_be_updated(monkeypatch: pytest.MonkeyPatch) -> None:
    session = DummySession()
    session.execute_results = [DummyResult(scalar_one_or_none=_comment(deleted=True))]
    monkeypatch.setattr(
        task_comments,
        "_load_task_and_membership",
        _fake_load(WorkspaceRole.MEMBER),
    )

    with pytest.raises(HTTPException) as exc:
        await task_comments.update_task_comment(session, 1, 10, 100, "Обновлено")

    assert exc.value.status_code == 400


def test_deleted_comment_dto_hides_body() -> None:
    dto = TaskCommentRead(
        id=1,
        task_id=10,
        workspace_id=7,
        author={"id": 1, "username": "user", "full_name": None, "avatar_url": None},
        body="secret",
        created_at=NOW,
        is_deleted=True,
        can_edit=False,
        can_delete=False,
    )

    assert dto.body is None


def test_comment_dto_exposes_minimal_avatar_fields_without_private_user_data() -> None:
    comment = _comment(author_id=5)
    dto = task_comments._to_read(comment, user_id=5, role=WorkspaceRole.MEMBER)
    payload = dto.model_dump()

    assert payload["author"]["avatar_letter"] == "U"
    assert payload["author"]["avatar_seed"] == "seed"
    assert "email" not in payload["author"]
    assert "hashed_password" not in payload["author"]


async def _noop_event(*_args, **_kwargs) -> None:
    return None
