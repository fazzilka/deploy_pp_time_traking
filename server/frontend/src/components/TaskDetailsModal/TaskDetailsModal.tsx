import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { GeneratedAvatar } from "../GeneratedAvatar/GeneratedAvatar";
import { ProjectBadge } from "../ProjectBadge/ProjectBadge";
import { PriorityIcon, priorityMeta } from "../PriorityIcon/PriorityIcon";
import { updateTask } from "../../shared/api/tasks";
import {
  createTaskComment,
  deleteTaskComment,
  getCachedTaskComments,
  getTaskComments,
  updateTaskComment,
} from "../../shared/api/taskComments";
import { USER_EVENT_RECEIVED_EVENT, type UserEventReceivedPayload } from "../../shared/events/userEvents";
import type { ProjectListItem } from "../../shared/types/project";
import type { Task } from "../../shared/types/task";
import type { TaskComment, TaskCommentsPage } from "../../shared/types/taskComment";
import { formatDeadline, getDeadlineLabel, getDeadlineStatus } from "../../shared/utils/date";
import { formatDate, formatDuration, formatHumanDuration } from "../../shared/utils/time";
import "./TaskDetailsModal.css";

type TaskDetailsModalProps = {
  task: Task;
  isActive: boolean;
  displaySeconds: number;
  isBusy: boolean;
  onClose: () => void;
  onStart: (taskId: number) => void;
  onStop: (taskId: number) => void;
  onDelete: (taskId: number) => void;
  onTaskUpdated: (previousTask: Task, task: Task) => void;
  projects?: ProjectListItem[];
  canStartTimer?: boolean;
  canDeleteTask?: boolean;
  canEditTask?: boolean;
};

function getAuthorDisplayName(comment: TaskComment): string {
  return comment.author.full_name || comment.author.username;
}

function getAuthorAvatarLetter(comment: TaskComment): string {
  return comment.author.avatar_letter || getAuthorDisplayName(comment).slice(0, 1).toUpperCase();
}

function getAuthorAvatarSeed(comment: TaskComment): string | number {
  return comment.author.avatar_seed ?? comment.author.username ?? comment.author.id;
}

export function TaskDetailsModal({
  task,
  isActive,
  displaySeconds,
  isBusy,
  onClose,
  onStart,
  onStop,
  onDelete,
  onTaskUpdated,
  projects = [],
  canStartTimer = true,
  canDeleteTask = true,
  canEditTask = true,
}: TaskDetailsModalProps) {
  const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(task.description ?? "");
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"about" | "comments">("about");
  const [commentsPage, setCommentsPage] = useState<TaskCommentsPage | null>(() =>
    getCachedTaskComments(task.workspace_id, task.id),
  );
  const [commentsLoaded, setCommentsLoaded] = useState(Boolean(commentsPage));
  const [isCommentsLoading, setIsCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [busyCommentId, setBusyCommentId] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const deadlineStatus = getDeadlineStatus(task.deadline);
  const deadlineHintClass =
    deadlineStatus === "upcoming"
      ? "task-info-card__hint--success"
      : deadlineStatus === "today"
        ? "task-info-card__hint--warning"
        : deadlineStatus === "overdue"
          ? "task-info-card__hint--danger"
          : "task-info-card__hint--muted";
  const hasDescription = Boolean(task.description?.trim());
  const isCompleted = task.is_completed;
  const statusText = isCompleted ? "Задача завершена" : isActive ? "Таймер запущен" : "Таймер остановлен";

  useEffect(() => {
    setDescriptionDraft(task.description ?? "");
    setIsDescriptionEditing(false);
    setDescriptionError(null);
    setActiveTab("about");
    const cachedComments = getCachedTaskComments(task.workspace_id, task.id);
    setCommentsPage(cachedComments);
    setCommentsLoaded(Boolean(cachedComments));
    setCommentsError(null);
    setCommentDraft("");
    setEditingCommentId(null);
  }, [task.id, task.description]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  function handleStartDescriptionEdit() {
    setDescriptionDraft(task.description ?? "");
    setDescriptionError(null);
    setIsDescriptionEditing(true);
  }

  function handleCancelDescriptionEdit() {
    setDescriptionDraft(task.description ?? "");
    setDescriptionError(null);
    setIsDescriptionEditing(false);
  }

  async function handleSaveDescription() {
    const nextDescription = descriptionDraft.trim();

    try {
      setIsSavingDescription(true);
      setDescriptionError(null);

      const updatedTask = await updateTask(task.id, {
        description: nextDescription || null,
      });

      onTaskUpdated(task, updatedTask);
      setIsDescriptionEditing(false);
    } catch (caughtError) {
      setDescriptionError(caughtError instanceof Error ? caughtError.message : "Не удалось сохранить описание");
    } finally {
      setIsSavingDescription(false);
    }
  }

  function handleDescriptionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancelDescriptionEdit();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void handleSaveDescription();
    }
  }

  async function handleProjectChange(nextValue: string) {
    const nextProjectId = nextValue === "none" ? null : Number(nextValue);

    try {
      setIsSavingProject(true);
      setProjectError(null);
      const updatedTask = await updateTask(task.id, {
        project_id: nextProjectId,
      });
      onTaskUpdated(task, updatedTask);
    } catch (caughtError) {
      setProjectError(caughtError instanceof Error ? caughtError.message : "Не удалось изменить проект");
    } finally {
      setIsSavingProject(false);
    }
  }

  async function loadComments(force = false) {
    try {
      setIsCommentsLoading(true);
      setCommentsError(null);
      const page = await getTaskComments({ taskId: task.id, workspaceId: task.workspace_id, force });
      setCommentsPage(page);
      setCommentsLoaded(true);
    } catch (caughtError) {
      setCommentsError(caughtError instanceof Error ? caughtError.message : "Не удалось загрузить комментарии");
    } finally {
      setIsCommentsLoading(false);
    }
  }

  function handleOpenComments() {
    setActiveTab("comments");
    if (!commentsLoaded) {
      void loadComments();
    }
  }

  function scheduleCommentsRefresh() {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void loadComments(true);
    }, 400);
  }

  useEffect(() => {
    function handleUserEvent(event: Event) {
      const detail = (event as CustomEvent<UserEventReceivedPayload>).detail;
      if (
        !detail
        || !["task_comment_created", "task_comment_updated", "task_comment_deleted"].includes(detail.event)
      ) {
        return;
      }

      const payload = detail.payload as { workspace_id?: unknown; task_id?: unknown };
      if (payload.workspace_id !== task.workspace_id || payload.task_id !== task.id) {
        return;
      }

      if (activeTab === "comments" && commentsLoaded) {
        scheduleCommentsRefresh();
        return;
      }

      if (detail.event === "task_comment_created") {
        setCommentsPage((current) => current ? { ...current, total_active: current.total_active + 1 } : current);
      } else if (detail.event === "task_comment_deleted") {
        setCommentsPage((current) =>
          current ? { ...current, total_active: Math.max(0, current.total_active - 1) } : current,
        );
      }
    }

    window.addEventListener(USER_EVENT_RECEIVED_EVENT, handleUserEvent);
    return () => window.removeEventListener(USER_EVENT_RECEIVED_EVENT, handleUserEvent);
  }, [activeTab, commentsLoaded, task.id, task.workspace_id]);

  async function handleSubmitComment() {
    if (isSubmittingComment || !commentDraft.trim()) {
      return;
    }
    try {
      setIsSubmittingComment(true);
      setCommentsError(null);
      const created = await createTaskComment(task.id, commentDraft);
      setCommentsPage((current) => {
        const base = current ?? { items: [], total_active: 0, limit: 30, next_cursor: null };
        return {
          ...base,
          items: [...base.items.filter((item) => item.id !== created.id), created],
          total_active: base.total_active + (created.is_deleted ? 0 : 1),
        };
      });
      setCommentsLoaded(true);
      setCommentDraft("");
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    } catch (caughtError) {
      setCommentsError(caughtError instanceof Error ? caughtError.message : "Не удалось отправить комментарий");
    } finally {
      setIsSubmittingComment(false);
    }
  }

  function handleCommentKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void handleSubmitComment();
    }
  }

  function startEditComment(comment: TaskComment) {
    setEditingCommentId(comment.id);
    setEditingDraft(comment.body ?? "");
  }

  async function saveCommentEdit(commentId: number) {
    if (!editingDraft.trim() || busyCommentId !== null) {
      return;
    }
    try {
      setBusyCommentId(commentId);
      setCommentsError(null);
      const updated = await updateTaskComment(task.id, commentId, editingDraft);
      setCommentsPage((current) =>
        current ? { ...current, items: current.items.map((item) => (item.id === updated.id ? updated : item)) } : current,
      );
      setEditingCommentId(null);
    } catch (caughtError) {
      setCommentsError(caughtError instanceof Error ? caughtError.message : "Не удалось сохранить комментарий");
    } finally {
      setBusyCommentId(null);
    }
  }

  async function handleDeleteComment(comment: TaskComment) {
    if (busyCommentId !== null || !window.confirm("Удалить комментарий?\nКомментарий будет скрыт для участников задачи.")) {
      return;
    }
    try {
      setBusyCommentId(comment.id);
      setCommentsError(null);
      const deleted = await deleteTaskComment(task.id, comment.id);
      setCommentsPage((current) => {
        if (!current) {
          return current;
        }
        const wasActive = current.items.some((item) => item.id === deleted.id && !item.is_deleted);
        return {
          ...current,
          items: current.items.map((item) => (item.id === deleted.id ? deleted : item)),
          total_active: Math.max(0, current.total_active - (wasActive ? 1 : 0)),
        };
      });
    } catch (caughtError) {
      setCommentsError(caughtError instanceof Error ? caughtError.message : "Не удалось удалить комментарий");
    } finally {
      setBusyCommentId(null);
    }
  }

  const commentsCount = commentsPage?.total_active ?? 0;
  const canCreateComment = canEditTask;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="task-details-modal" role="dialog" aria-modal="true" aria-labelledby="task-details-title" onClick={(event) => event.stopPropagation()}>
        <header className="task-details-modal__header">
          <p className="task-details-modal__status">{statusText}</p>
          <div className="task-details-modal__heading">
            <h2
              className={`task-details-modal__title${isCompleted ? " task-details-modal__title--completed" : ""}`}
              id="task-details-title"
            >
              {task.title}
            </h2>
            <button className="task-details-modal__close" type="button" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
          <div className="task-details-modal__project">
            <ProjectBadge project={task.project} fallback />
          </div>
        </header>

        <div className="task-details-modal__body">
          <div className="task-details-modal__tabs" role="tablist" aria-label="Разделы задачи">
            <button
              className={`task-details-modal__tab${activeTab === "about" ? " task-details-modal__tab--active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeTab === "about"}
              onClick={() => setActiveTab("about")}
            >
              О задаче
            </button>
            <button
              className={`task-details-modal__tab${activeTab === "comments" ? " task-details-modal__tab--active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeTab === "comments"}
              onClick={handleOpenComments}
            >
              Комментарии {commentsCount}
            </button>
          </div>

          {activeTab === "about" ? (
            <>
              <section className={`task-description${isDescriptionEditing ? " task-description--editing" : ""}`}>
                <h3 className="task-description__title">Описание</h3>

                {isDescriptionEditing ? (
                  <div className="task-description__editor">
                    <textarea
                      className="task-description__textarea"
                      value={descriptionDraft}
                      onChange={(event) => setDescriptionDraft(event.target.value)}
                      onKeyDown={handleDescriptionKeyDown}
                      autoFocus
                      placeholder="Добавьте описание..."
                      disabled={isSavingDescription}
                    />

                    <div className="task-description__actions">
                      <button
                        className="task-description__save"
                        type="button"
                        onClick={() => void handleSaveDescription()}
                        disabled={isSavingDescription}
                      >
                        {isSavingDescription ? "Сохраняем..." : "Сохранить"}
                      </button>
                      <button
                        className="task-description__cancel"
                        type="button"
                        onClick={handleCancelDescriptionEdit}
                        disabled={isSavingDescription}
                      >
                        Отмена
                      </button>
                    </div>

                    {descriptionError && <div className="task-description__error">{descriptionError}</div>}
                  </div>
                ) : (
                  <button
                    className={`task-description__preview${hasDescription ? "" : " task-description__preview--empty"}`}
                    type="button"
                    onClick={handleStartDescriptionEdit}
                    disabled={!canEditTask}
                  >
                    {hasDescription ? task.description : "Описание не указано"}
                  </button>
                )}
              </section>

              <div className="task-details-modal__info-grid">
                <div className="task-info-card">
                  <span className="task-info-card__label">Суммарное время</span>
                  <strong className="task-info-card__value">{formatDuration(displaySeconds)}</strong>
                </div>

                <div className="task-info-card">
                  <span className="task-info-card__label">Формат</span>
                  <strong className="task-info-card__value">{formatHumanDuration(displaySeconds)}</strong>
                </div>

                <div className="task-info-card">
                  <span className="task-info-card__label">Срок выполнения</span>
                  <strong className="task-info-card__value">{formatDeadline(task.deadline)}</strong>
                  <span className={`task-info-card__hint ${deadlineHintClass}`}>{getDeadlineLabel(task.deadline)}</span>
                </div>

                <div className="task-info-card">
                  <span className="task-info-card__label">Приоритет</span>
                  <div className="task-info-card__priority">
                    <PriorityIcon priority={task.priority} />
                    <span>{priorityMeta[task.priority].label}</span>
                  </div>
                </div>

                <div className="task-info-card">
                  <span className="task-info-card__label">Проект</span>
                  <select
                    className="task-info-card__select"
                    value={task.project_id == null ? "none" : String(task.project_id)}
                    onChange={(event) => void handleProjectChange(event.target.value)}
                    disabled={isSavingProject || !canEditTask}
                  >
                    <option value="none">Без проекта</option>
                    {projects.map((project) => (
                      <option key={project.id} value={String(project.id)}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  {projectError && <span className="task-info-card__hint task-info-card__hint--danger">{projectError}</span>}
                </div>
              </div>

              {task.created_at && <p className="task-details-modal__created">Создана: {formatDate(task.created_at)}</p>}
            </>
          ) : (
            <section className="task-comments" aria-label="Комментарии задачи">
              <div className="task-comments__header">
                <h3>Комментарии</h3>
                <span>{commentsCount}</span>
              </div>

              {isCommentsLoading && !commentsLoaded && <p className="task-comments__state">Загружаем комментарии...</p>}
              {commentsError && <p className="task-comments__error">{commentsError}</p>}

              <div className="task-comments__list">
                {commentsPage?.items.length ? (
                  commentsPage.items.map((comment) => (
                    <article className={`task-comment${comment.is_deleted ? " task-comment--deleted" : ""}`} key={comment.id}>
                      <div className="task-comment__avatar" aria-hidden="true">
                        <GeneratedAvatar
                          seed={getAuthorAvatarSeed(comment)}
                          letter={getAuthorAvatarLetter(comment)}
                          size={40}
                          title={getAuthorDisplayName(comment)}
                        />
                      </div>
                      <div className="task-comment__body">
                        <div className="task-comment__meta">
                          <strong>{getAuthorDisplayName(comment)}</strong>
                          <span>{formatDate(comment.created_at)}</span>
                        </div>

                        {editingCommentId === comment.id && !comment.is_deleted ? (
                          <div className="task-comment__editor">
                            <textarea
                              className="task-comment__textarea"
                              value={editingDraft}
                              onChange={(event) => setEditingDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                                  event.preventDefault();
                                  void saveCommentEdit(comment.id);
                                }
                                if (event.key === "Escape") {
                                  setEditingCommentId(null);
                                }
                              }}
                              disabled={busyCommentId === comment.id}
                              autoFocus
                            />
                            <div className="task-comment__edit-actions">
                              <button
                                type="button"
                                onClick={() => void saveCommentEdit(comment.id)}
                                disabled={!editingDraft.trim() || busyCommentId === comment.id}
                              >
                                Сохранить
                              </button>
                              <button type="button" onClick={() => setEditingCommentId(null)} disabled={busyCommentId === comment.id}>
                                Отмена
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="task-comment__text">
                              {comment.is_deleted ? "Комментарий удалён" : comment.body}
                            </p>
                            {comment.updated_at && !comment.is_deleted && <span className="task-comment__edited">изменено</span>}
                          </>
                        )}
                      </div>

                      {!comment.is_deleted && (comment.can_edit || comment.can_delete) && (
                        <div className="task-comment__actions">
                          {comment.can_edit && (
                            <button type="button" onClick={() => startEditComment(comment)} disabled={busyCommentId === comment.id}>
                              Редактировать
                            </button>
                          )}
                          {comment.can_delete && (
                            <button type="button" onClick={() => void handleDeleteComment(comment)} disabled={busyCommentId === comment.id}>
                              Удалить
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  ))
                ) : (
                  !isCommentsLoading && <p className="task-comments__state">Комментариев пока нет.</p>
                )}
              </div>

              <div className="task-comments__composer">
                {canCreateComment ? (
                  <>
                    <textarea
                      ref={textareaRef}
                      className="task-comments__textarea"
                      value={commentDraft}
                      onChange={(event) => setCommentDraft(event.target.value)}
                      onKeyDown={handleCommentKeyDown}
                      placeholder="Напишите комментарий…"
                      maxLength={5000}
                      disabled={isSubmittingComment}
                    />
                    <div className="task-comments__composer-footer">
                      {commentDraft.length >= 4500 && <span>{commentDraft.length}/5000</span>}
                      <button
                        className="button button--green"
                        type="button"
                        onClick={() => void handleSubmitComment()}
                        disabled={!commentDraft.trim() || isSubmittingComment}
                      >
                        {isSubmittingComment ? "Отправляем..." : "Отправить"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="task-comments__viewer-note">У вас есть доступ к просмотру комментариев.</p>
                )}
              </div>
            </section>
          )}
        </div>

        <footer className="task-details-modal__actions">
          <button
            className={`button ${isActive ? "button--red" : "button--green"}`}
            type="button"
            onClick={() => (isActive ? onStop(task.id) : onStart(task.id))}
            disabled={isBusy || !canStartTimer || (isCompleted && !isActive)}
          >
            {isActive ? "Остановить" : isCompleted ? "Done" : "Start"}
          </button>
          <button
            className="button button--red"
            type="button"
            onClick={() => onDelete(task.id)}
            disabled={isBusy || !canDeleteTask}
          >
            Удалить
          </button>
          <button className="button" type="button" onClick={onClose}>
            Закрыть
          </button>
        </footer>
      </section>
    </div>
  );
}
