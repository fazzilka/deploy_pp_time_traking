import { ProjectBadge } from "../ProjectBadge/ProjectBadge";
import { PriorityIcon } from "../PriorityIcon/PriorityIcon";
import type { Task } from "../../shared/types/task";
import { formatDeadline } from "../../shared/utils/date";
import { formatDeadlineCountdownCompact } from "../../shared/utils/deadline";
import { formatDuration } from "../../shared/utils/time";
import { useLocale } from "../../i18n";
import "./TaskRow.css";

type TaskRowProps = {
  task: Task;
  isActive: boolean;
  displaySeconds: number;
  isBusy: boolean;
  onOpen: (task: Task) => void;
  onStart: (taskId: number) => void;
  onStop: (taskId: number) => void;
  onDelete: (taskId: number) => void;
  onToggleCompleted: (task: Task) => void;
  canStartTimer?: boolean;
  canDeleteTask?: boolean;
  canToggleCompleted?: boolean;
};

export function TaskRow({
  task,
  isActive,
  displaySeconds,
  isBusy,
  onOpen,
  onStart,
  onStop,
  onDelete,
  onToggleCompleted,
  canStartTimer = true,
  canDeleteTask = true,
  canToggleCompleted = true,
}: TaskRowProps) {
  const { locale, t } = useLocale();
  const isCompleted = task.is_completed;
  const deadlineCountdown = formatDeadlineCountdownCompact(task.deadline, undefined, locale);
  const deadlineStatus = isCompleted ? "completed" : deadlineCountdown.status;
  const deadlineDetail = task.deadline ? deadlineCountdown.label : null;

  const rowClassName = [
    "task-row",
    isActive ? "task-row--active" : "",
    isCompleted ? "task-row--completed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const actionButtonClassName = [
    "task-row__button",
    "button",
    isActive ? "button--red" : "button--green",
  ]
    .filter(Boolean)
    .join(" ");

  function handleOpen() {
    onOpen(task);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(task);
    }
  }

  function handleToggleCompleted(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onToggleCompleted(task);
  }

  function handleTimerClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();

    if (isCompleted && !isActive) {
      return;
    }

    if (isActive) {
      onStop(task.id);
      return;
    }

    onStart(task.id);
  }

  function handleDelete(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onDelete(task.id);
  }

  return (
    <article className={rowClassName} onClick={handleOpen} onKeyDown={handleKeyDown} role="button" tabIndex={0}>
      <button
        className={`task-row__complete-button${isCompleted ? " task-row__complete-button--completed" : ""}`}
        type="button"
        onClick={handleToggleCompleted}
        disabled={isBusy || !canToggleCompleted}
        aria-label={t(isCompleted ? "tasks.actions.restore" : "tasks.actions.markCompleted")}
      >
        <span aria-hidden="true">✓</span>
      </button>

      <div className="task-row__content">
        <h3 className="task-row__title">{task.title}</h3>
        <p className="task-row__description">{task.description || t("tasks.labels.noDescription")}</p>

        <div className="task-row__meta">
          <ProjectBadge project={task.project} fallback />
          <PriorityIcon priority={task.priority} />
        </div>
      </div>

      <div className={`task-row__deadline task-row__deadline--${deadlineStatus}`}>
        <span className="task-row__deadline-label">{t("tasks.labels.deadline")}</span>
        <span className="task-row__deadline-date">{formatDeadline(task.deadline, locale)}</span>
        {deadlineDetail ? <em className="task-row__deadline-detail">{deadlineDetail}</em> : null}
        {isCompleted ? <span className="task-row__deadline-completed">{t("tasks.status.completed")}</span> : null}
      </div>

      <div className="task-row__time" aria-label={`${t("tasks.labels.tracked")}: ${formatDuration(displaySeconds)}`}>
        <span>{t("tasks.labels.tracked")}</span>
        <strong>{formatDuration(displaySeconds)}</strong>
      </div>

      <div className="task-row__action">
        {isCompleted && !isActive ? (
          <span className="task-row__button button task-row__completed-status" role="status">
            {t("tasks.actions.completed")}
          </span>
        ) : (
          <button
            className={actionButtonClassName}
            type="button"
            onClick={handleTimerClick}
            disabled={isBusy || !canStartTimer}
          >
            {t(isActive ? "tasks.actions.stop" : "tasks.actions.start")}
          </button>
        )}
      </div>

      <button
        className="task-row__delete"
        type="button"
        onClick={handleDelete}
        disabled={isBusy || !canDeleteTask}
        aria-label={t("tasks.actions.deleteLabel", { title: task.title })}
      >
        ×
      </button>
    </article>
  );
}
