import { ProjectBadge } from "../ProjectBadge/ProjectBadge";
import { PriorityIcon } from "../PriorityIcon/PriorityIcon";
import type { Task } from "../../shared/types/task";
import { formatDeadline } from "../../shared/utils/date";
import { formatDeadlineCountdownCompact } from "../../shared/utils/deadline";
import { formatDuration } from "../../shared/utils/time";
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
}: TaskRowProps) {
  const isCompleted = task.is_completed;
  const deadlineCountdown = formatDeadlineCountdownCompact(task.deadline);
  const deadlineStatus = isCompleted ? "completed" : deadlineCountdown.status;
  const deadlineDetail = task.deadline ? (isCompleted ? "сделано" : deadlineCountdown.label) : null;

  return (
    <article
      className={`task-row${isActive ? " task-row--active" : ""}${isCompleted ? " task-row--completed" : ""}`}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onOpen(task);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <button
        className={`task-row__complete-button${isCompleted ? " task-row__complete-button--completed" : ""}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleCompleted(task);
        }}
        disabled={isBusy}
        aria-label={isCompleted ? "Вернуть задачу в работу" : "Отметить задачу как выполненную"}
      >
        <span aria-hidden="true">✓</span>
      </button>

      <div className="task-row__content">
        <h3 className="task-row__title">{task.title}</h3>
        <p className="task-row__description">{task.description || "Без описания"}</p>
        <div className="task-row__meta">
          <ProjectBadge project={task.project} fallback />
          <PriorityIcon priority={task.priority} />
        </div>
      </div>

      <div className={`task-row__deadline task-row__deadline--${deadlineStatus}`}>
        <span className="task-row__deadline-label">Дедлайн</span>
        <span className="task-row__deadline-date">{formatDeadline(task.deadline)}</span>
        {deadlineDetail ? <em className="task-row__deadline-detail">{deadlineDetail}</em> : null}
      </div>

      <div className="task-row__time">{formatDuration(displaySeconds)}</div>

      <button
        className={`task-row__button button ${isActive ? "button--red" : "button--green"}${isCompleted && !isActive ? " task-row__button--completed" : ""}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          isActive ? onStop(task.id) : onStart(task.id);
        }}
        disabled={isBusy || (isCompleted && !isActive)}
      >
        {isActive ? "Stop" : isCompleted ? "Done" : "Start"}
      </button>
      <button
        className="task-row__delete"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(task.id);
        }}
        disabled={isBusy}
        aria-label={`Удалить задачу ${task.title}`}
      >
        ×
      </button>
    </article>
  );
}
