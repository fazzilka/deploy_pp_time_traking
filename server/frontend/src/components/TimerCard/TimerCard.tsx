import { ProjectBadge } from "../ProjectBadge/ProjectBadge";
import type { Task } from "../../shared/types/task";
import { formatDeadlineCountdown } from "../../shared/utils/deadline";
import { formatDuration } from "../../shared/utils/time";
import { useLocale } from "../../i18n";
import "./TimerCard.css";

type TimerCardProps = {
  activeTask: Task | null;
  elapsedTime: number;
  activeCount: number;
  isStopping: boolean;
  onStop: () => void;
};

export function TimerCard({ activeTask, elapsedTime, activeCount, isStopping, onStop }: TimerCardProps) {
  const { locale, t } = useLocale();
  const deadlineCountdown = formatDeadlineCountdown(activeTask?.deadline, undefined, locale);
  const deadlineHint = activeTask
    ? deadlineCountdown.status === "none"
      ? t("timer.addDeadline")
      : deadlineCountdown.isOverdue
        ? t("timer.deadlinePassed")
        : t("timer.deadlineRemaining")
    : t("timer.startHint");

  return (
    <section className={`timer-card${activeTask ? "" : " timer-card--empty"}`} aria-label={t("timer.label")}>
      <div className="timer-card__main">
        <p className="timer-card__label">{t("timer.activeTask")}</p>

        <div className="timer-card__content">
          {activeTask ? (
            <>
              <h2 className="timer-card__title">{activeTask.title}</h2>
              <div className="timer-card__project">
                <ProjectBadge project={activeTask.project} fallback />
              </div>
              <p className="timer-card__description">{activeTask.description || t("tasks.labels.noDescription")}</p>
            </>
          ) : (
            <>
              <h2 className="timer-card__title">{t("timer.noTask")}</h2>
              <p className="timer-card__description">{t("timer.noTaskDescription")}</p>
            </>
          )}
        </div>

        <div className="timer-card__deadline" aria-live="polite">
          <span className="timer-card__deadline-label">{t("timer.deadline")}</span>
          <strong
            className={`timer-card__deadline-countdown timer-card__deadline-countdown--${deadlineCountdown.status}`}
          >
            {deadlineCountdown.label}
          </strong>
          <span className="timer-card__deadline-hint">{deadlineHint}</span>
        </div>

        <div className="timer-card__session-time">
          <span>{t("timer.inProgress")}</span>
          <strong className="timer-card__session-time-value">{formatDuration(activeTask ? elapsedTime : 0)}</strong>
          <em>{t("timer.activeCount", { count: activeTask ? activeCount : 0 })}</em>
        </div>
      </div>

      {activeTask ? (
        <div className="timer-card__actions">
          <button className="timer-card__stop button button--red" type="button" onClick={onStop} disabled={isStopping}>
            {isStopping ? t("timer.stopping") : t("tasks.actions.stop")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
