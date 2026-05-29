import type { Task } from "../../shared/types/task";
import { formatDuration } from "../../shared/utils/time";
import "./TimerCard.css";

type TimerCardProps = {
  activeTask: Task | null;
  elapsedTime: number;
  isStopping: boolean;
  onStop: () => void;
};

export function TimerCard({ activeTask, elapsedTime, isStopping, onStop }: TimerCardProps) {
  return (
    <section className="timer-card" aria-label="Активный таймер">
      <p className="timer-card__label">Активная задача</p>

      {activeTask ? (
        <>
          <h2 className="timer-card__title">{activeTask.title}</h2>
          {activeTask.description && <p className="timer-card__description">{activeTask.description}</p>}
          <div className="timer-card__time" aria-live="polite">
            {formatDuration(elapsedTime)}
          </div>
          <button className="timer-card__stop button button--red" type="button" onClick={onStop} disabled={isStopping}>
            {isStopping ? "Стоп..." : "Остановить"}
          </button>
        </>
      ) : (
        <div className="timer-card__empty">
          <h2 className="timer-card__title">Нет активной задачи</h2>
          <p>Запустите таймер у любой задачи из очереди.</p>
          <div className="timer-card__time timer-card__time--muted">00:00:00</div>
        </div>
      )}
    </section>
  );
}
