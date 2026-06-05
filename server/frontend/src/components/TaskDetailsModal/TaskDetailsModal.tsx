import { useEffect, useState, type KeyboardEvent } from "react";
import { PriorityIcon, priorityMeta } from "../PriorityIcon/PriorityIcon";
import { updateTask } from "../../shared/api/tasks";
import type { Task } from "../../shared/types/task";
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
  onTaskUpdated: (task: Task) => void;
};

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
}: TaskDetailsModalProps) {
  const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(task.description ?? "");
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
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

  useEffect(() => {
    setDescriptionDraft(task.description ?? "");
    setIsDescriptionEditing(false);
    setDescriptionError(null);
  }, [task.id, task.description]);

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

      onTaskUpdated(updatedTask);
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

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="task-details-modal" role="dialog" aria-modal="true" aria-labelledby="task-details-title" onClick={(event) => event.stopPropagation()}>
        <button className="task-details-modal__close" type="button" onClick={onClose} aria-label="Закрыть">
          ×
        </button>

        <div className="task-details-modal__content">
          <p className="task-details-modal__status">{isActive ? "Таймер запущен" : "Таймер остановлен"}</p>
          <h2 className="task-details-modal__title" id="task-details-title">
            {task.title}
          </h2>

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
          </div>

          {task.created_at && <p className="task-details-modal__created">Создана: {formatDate(task.created_at)}</p>}

          <div className="task-details-modal__actions">
            <button
              className={`button ${isActive ? "button--red" : "button--green"}`}
              type="button"
              onClick={() => (isActive ? onStop(task.id) : onStart(task.id))}
              disabled={isBusy}
            >
              {isActive ? "Остановить" : "Start"}
            </button>
            <button className="button button--red" type="button" onClick={() => onDelete(task.id)} disabled={isBusy}>
              Удалить
            </button>
            <button className="button" type="button" onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
