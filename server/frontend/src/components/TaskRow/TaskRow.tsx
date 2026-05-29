import type { Task } from "../../shared/types/task";
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
};

export function TaskRow({ task, isActive, displaySeconds, isBusy, onOpen, onStart, onStop, onDelete }: TaskRowProps) {
  return (
    <article
      className={`task-row${isActive ? " task-row--active" : ""}`}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onOpen(task);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="task-row__dot" aria-hidden="true" />

      <div className="task-row__content">
        <h3 className="task-row__title">{task.title}</h3>
        <p className="task-row__description">{task.description || "Без описания"}</p>
      </div>

      <div className="task-row__time">{formatDuration(displaySeconds)}</div>

      <button
        className={`task-row__button button ${isActive ? "button--red" : "button--green"}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          isActive ? onStop(task.id) : onStart(task.id);
        }}
        disabled={isBusy}
      >
        {isActive ? "Stop" : "Start"}
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
