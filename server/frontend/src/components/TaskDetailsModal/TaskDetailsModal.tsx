import { PriorityIcon, priorityMeta } from "../PriorityIcon/PriorityIcon";
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
}: TaskDetailsModalProps) {
  const deadlineStatus = getDeadlineStatus(task.deadline);
  const deadlineHintClass =
    deadlineStatus === "upcoming"
      ? "task-info-card__hint--success"
      : deadlineStatus === "today"
        ? "task-info-card__hint--warning"
        : deadlineStatus === "overdue"
          ? "task-info-card__hint--danger"
          : "task-info-card__hint--muted";

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

          <p className="task-details-modal__description">{task.description || "Описание не указано"}</p>

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
