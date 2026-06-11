import { ProjectBadge } from "../ProjectBadge/ProjectBadge";
import type { Task } from "../../shared/types/task";
import { formatDuration } from "../../shared/utils/time";
import "./TimerCard.css";

type TimerCardProps = {
  activeTask: Task | null;
  elapsedTime: number;
  activeCount: number;
  isStopping: boolean;
  onStop: () => void;
};

export function TimerCard({ activeTask, elapsedTime, activeCount, isStopping, onStop }: TimerCardProps) {
  return (
    <section className="timer-card" aria-label="Активный таймер">
      <p className="timer-card__label">Активная задача</p>

      <div className="timer-card__content">
        {activeTask ? (
          <>
            <h2 className="timer-card__title">{activeTask.title}</h2>
            <div className="timer-card__project">
              <ProjectBadge project={activeTask.project} fallback />
            </div>
            <p className="timer-card__description">{activeTask.description || "Описание не указано"}</p>
            <p className="timer-card__count">Активно таймеров: {activeCount}</p>
          </>
        ) : (
          <>
            <h2 className="timer-card__title">Нет активной задачи</h2>
            <p className="timer-card__description">Запустите таймер у любой задачи из очереди.</p>
            <p className="timer-card__count">Активно таймеров: 0</p>
          </>
        )}
      </div>

      <div className={`timer-card__time${activeTask ? "" : " timer-card__time--empty"}`} aria-live="polite">
        {formatDuration(elapsedTime)}
      </div>

      <div className="timer-card__actions">
        {activeTask ? (
          <button className="timer-card__stop button button--red" type="button" onClick={onStop} disabled={isStopping}>
            {isStopping ? "Стоп..." : "Остановить"}
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
    </section>
  );
}
