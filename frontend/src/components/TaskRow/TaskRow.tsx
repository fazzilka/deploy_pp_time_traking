import type { Task } from "../../shared/types/task";
import { formatDuration } from "../../shared/utils/time";
import "./TaskRow.css";

type TaskRowProps = {
  task: Task;
  isActive: boolean;
  displaySeconds: number;
  isBusy: boolean;
  onStart: (taskId: number) => void;
  onStop: (taskId: number) => void;
};

export function TaskRow({ task, isActive, displaySeconds, isBusy, onStart, onStop }: TaskRowProps) {
  return (
    <article className={`task-row${isActive ? " task-row--active" : ""}`}>
      <span className="task-row__dot" aria-hidden="true" />

      <div className="task-row__content">
        <h3 className="task-row__title">{task.title}</h3>
        <p className="task-row__description">{task.description || "Без описания"}</p>
      </div>

      <div className="task-row__time">{formatDuration(displaySeconds)}</div>

      <button
        className={`task-row__button button ${isActive ? "button--red" : "button--green"}`}
        type="button"
        onClick={() => (isActive ? onStop(task.id) : onStart(task.id))}
        disabled={isBusy}
      >
        {isActive ? "Stop" : "Start"}
      </button>
    </article>
  );
}
