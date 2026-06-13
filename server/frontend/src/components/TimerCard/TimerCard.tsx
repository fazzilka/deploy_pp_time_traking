import { ProjectBadge } from "../ProjectBadge/ProjectBadge";
import type { Task } from "../../shared/types/task";
import { formatDeadlineCountdown } from "../../shared/utils/deadline";
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
  const deadlineCountdown = formatDeadlineCountdown(activeTask?.deadline);
  const deadlineHint = activeTask
    ? deadlineCountdown.status === "none"
      ? "Добавьте срок, чтобы видеть обратный отсчёт"
      : deadlineCountdown.isOverdue
        ? "Дедлайн уже прошёл"
        : "Оставшееся время до срока задачи"
    : "Запустите таймер у задачи из очереди";

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
          </>
        ) : (
          <>
            <h2 className="timer-card__title">Нет активной задачи</h2>
            <p className="timer-card__description">Запустите таймер у любой задачи из очереди.</p>
          </>
        )}
      </div>

      <div className="timer-card__deadline" aria-live="polite">
        <span className="timer-card__deadline-label">До дедлайна</span>
        <strong
          className={`timer-card__deadline-countdown timer-card__deadline-countdown--${deadlineCountdown.status}`}
        >
          {deadlineCountdown.label}
        </strong>
        <span className="timer-card__deadline-hint">{deadlineHint}</span>
      </div>

      <div className="timer-card__session-time">
        <span>В работе</span>
        <strong className="timer-card__session-time-value">{formatDuration(activeTask ? elapsedTime : 0)}</strong>
        <em>Активно таймеров: {activeTask ? activeCount : 0}</em>
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
