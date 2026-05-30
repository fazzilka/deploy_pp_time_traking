import { PriorityIcon } from "../PriorityIcon/PriorityIcon";
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

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="task-details-modal" role="dialog" aria-modal="true" aria-labelledby="task-details-title" onClick={(event) => event.stopPropagation()}>
        <div className="task-details-modal__layout">
          <div className="task-details-modal__main">
            <div className="task-details-modal__header">
              <div>
                <p className="task-details-modal__label">{isActive ? "Таймер запущен" : "Таймер остановлен"}</p>
                <h2 className="task-details-modal__title" id="task-details-title">
                  {task.title}
                </h2>
              </div>
              <button className="task-details-modal__close" type="button" onClick={onClose} aria-label="Закрыть">
                ×
              </button>
            </div>

            <p className="task-details-modal__description">{task.description || "Описание не указано"}</p>

            <dl className="task-details-modal__meta">
              <div>
                <dt>Суммарное время</dt>
                <dd>{formatDuration(displaySeconds)}</dd>
              </div>
              <div>
                <dt>Формат</dt>
                <dd>{formatHumanDuration(displaySeconds)}</dd>
              </div>
              {task.created_at && (
                <div>
                  <dt>Создана</dt>
                  <dd>{formatDate(task.created_at)}</dd>
                </div>
              )}
            </dl>

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

          <aside className="task-details-modal__side" aria-label="Параметры задачи">
            <div className="task-meta-card">
              <span className="task-meta-card__label">Срок выполнения</span>
              <strong className="task-meta-card__value">{formatDeadline(task.deadline)}</strong>
              <span className={`task-meta-card__status task-meta-card__status--${deadlineStatus}`}>
                {getDeadlineLabel(task.deadline)}
              </span>
            </div>

            <div className="task-meta-card">
              <span className="task-meta-card__label">Приоритет</span>
              <PriorityIcon priority={task.priority} showLabel />
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
