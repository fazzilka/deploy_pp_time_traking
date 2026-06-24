import { useMemo, useState, useSyncExternalStore } from "react";
import { PriorityIcon } from "../../components/PriorityIcon/PriorityIcon";
import { StatCard } from "../../components/StatCard/StatCard";
import {
  getReportsSnapshot,
  refreshReportsForWorkspace,
  subscribeToReportsCache,
} from "../../shared/api/reports";
import type { ActivityDay, ProjectsTimeSummaryResponse, SummaryResponse } from "../../shared/types/reports";
import { useWorkspace } from "../../shared/workspace/WorkspaceContext";
import { getBestActivityDay } from "../../shared/utils/activity";
import { formatDuration, formatHumanDuration } from "../../shared/utils/time";
import "./ReportsPage.css";

const weekdayLabels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

type ReportsState = {
  summary: SummaryResponse;
  days: ActivityDay[];
  projectsSummary: ProjectsTimeSummaryResponse;
};

type ReportPeriod = 7 | 30;

type TimeByDay = {
  date: string;
  weekdayLabel: string;
  totalSeconds: number;
  heightPercent: number;
  title: string;
  showLabel: boolean;
};

function getLastNDays(count: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - 1 - index));
    return date;
  });
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function shouldShowDayLabel(index: number, period: ReportPeriod): boolean {
  return period === 7 || index === 0 || index === period - 1 || (index + 1) % 5 === 0;
}

function buildTimeByDays(days: ActivityDay[], period: ReportPeriod): TimeByDay[] {
  const secondsByDate = new Map(
    days.map((day) => [day.date, Math.max(0, Math.floor(day.total_time_seconds || 0))]),
  );
  const rawDays = getLastNDays(period).map((date, index) => {
    const dateKey = toLocalDateKey(date);

    return {
      date,
      dateKey,
      totalSeconds: secondsByDate.get(dateKey) ?? 0,
      showLabel: shouldShowDayLabel(index, period),
    };
  });
  const maxSeconds = Math.max(...rawDays.map((day) => day.totalSeconds), 0);

  return rawDays.map((day) => {
    const heightPercent =
      day.totalSeconds > 0 && maxSeconds > 0
        ? Math.max(Math.round((day.totalSeconds / maxSeconds) * 100), 8)
        : 0;

    return {
      date: day.dateKey,
      weekdayLabel: weekdayLabels[day.date.getDay()],
      totalSeconds: day.totalSeconds,
      heightPercent,
      title: `${formatShortDate(day.date)}: ${formatDuration(day.totalSeconds)}`,
      showLabel: day.showLabel,
    };
  });
}

function buildProjectConicGradient(projectsSummary: ProjectsTimeSummaryResponse): string {
  if (projectsSummary.total_time_seconds <= 0) {
    return "var(--color-panel-soft)";
  }

  let cursor = 0;
  const segments = projectsSummary.items
    .filter((item) => item.total_time_seconds > 0)
    .map((item) => {
      const size = (item.total_time_seconds / projectsSummary.total_time_seconds) * 100;
      const start = cursor;
      cursor += size;
      return `${item.color} ${start}% ${cursor}%`;
    });

  return `conic-gradient(${segments.join(", ")})`;
}

export function ReportsPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [period, setPeriod] = useState<ReportPeriod>(7);
  const reportsSnapshot = useSyncExternalStore(
    subscribeToReportsCache,
    () => getReportsSnapshot(currentWorkspaceId),
    () => getReportsSnapshot(currentWorkspaceId),
  );
  const reports: ReportsState | null = reportsSnapshot.data
    ? {
        summary: reportsSnapshot.data.summary,
        days: reportsSnapshot.data.activity.days,
        projectsSummary: reportsSnapshot.data.projectsSummary,
      }
    : null;
  const isLoading = reportsSnapshot.isLoading;
  const error = reportsSnapshot.error;

  const stats = useMemo(() => {
    if (!reports) {
      return null;
    }

    const activeDays = reports.days.filter((day) => day.total_time_seconds > 0);
    const totalActivityTime = reports.days.reduce((sum, day) => sum + day.total_time_seconds, 0);
    const bestDay = getBestActivityDay(reports.days);

    return {
      tasksWithTime: reports.summary.tasks_with_time_count,
      averagePerDay: activeDays.length > 0 ? Math.floor(totalActivityTime / activeDays.length) : 0,
      bestDay,
    };
  }, [reports]);

  if (isLoading) {
    return (
      <main className="reports-page app-container">
        <div className="status-message">Загружаем отчёты...</div>
      </main>
    );
  }

  if (!reports || !stats) {
    return (
      <main className="reports-page app-container">
        <div className="status-message status-message--error">{error || "Нет данных для отчёта"}</div>
      </main>
    );
  }

  const timeByDays = buildTimeByDays(reports.days, period);
  const hasAnyTimeInPeriod = timeByDays.some((day) => day.totalSeconds > 0);
  const topThreeTasks = reports.summary.top_tasks.slice(0, 3);
  const topProjects = reports.projectsSummary.items.filter((item) => item.total_time_seconds > 0).slice(0, 5);
  const maxTaskTime = Math.max(...topThreeTasks.map((task) => task.total_time_seconds), 1);
  const maxProjectTime = Math.max(...topProjects.map((project) => project.total_time_seconds), 1);
  const periodLabel = period === 7 ? "Последние 7 дней" : "Последние 30 дней";
  const hasProjectTime = reports.projectsSummary.total_time_seconds > 0;

  return (
    <main className="reports-page app-container">
      <section className="reports-header">
        <div>
          <p className="eyebrow">Аналитика</p>
          <h1 className="reports-title">Отчёты по времени</h1>
          <p className="page-copy">Сводка времени, динамика за неделю и задачи, которые забрали больше всего внимания.</p>
        </div>

        <div className="reports-header__actions">
          <button
            className="reports-refresh"
            type="button"
            disabled={isLoading}
            onClick={() => {
              if (currentWorkspaceId !== null) {
                void refreshReportsForWorkspace(currentWorkspaceId).catch(() => undefined);
              }
            }}
          >
            Обновить
          </button>
          <select
            className="reports-period"
            value={String(period)}
            aria-label="Период отчёта"
            onChange={(event) => setPeriod(event.target.value === "30" ? 30 : 7)}
          >
            <option value="7">Последние 7 дней</option>
            <option value="30">Последние 30 дней</option>
          </select>
        </div>
      </section>

      {error && <div className="status-message status-message--error reports-error">{error}</div>}

      <section className="reports-stats" aria-label="Ключевые показатели">
        <StatCard title="Всего времени" value={formatHumanDuration(reports.summary.total_time_seconds_all_tasks)} subtitle="по всем задачам" />
        <StatCard title="Задач с временем" value={String(stats.tasksWithTime)} subtitle="есть записанные интервалы" accent="blue" />
        <StatCard title="Среднее в день" value={formatHumanDuration(stats.averagePerDay)} subtitle="по активным дням" accent="yellow" />
        <StatCard
          title="Лучший день"
          value={formatHumanDuration(stats.bestDay?.total_time_seconds ?? 0)}
          subtitle={stats.bestDay?.date ?? "Недостаточно данных"}
          accent="green"
        />
      </section>

      <section className="reports-main">
        <div className="week-chart">
          <div className="week-chart__header">
            <div>
              <h2>Время по дням</h2>
              <p>{periodLabel}</p>
            </div>
          </div>

          <div className={`week-chart__bars week-chart__bars--days-${period}`}>
            {timeByDays.map((day) => (
              <div className="week-chart__bar-wrap" key={day.date}>
                <div className="week-chart__bar" title={day.title}>
                  <div className="week-chart__bar-fill" style={{ height: `${day.heightPercent}%` }} />
                </div>
                <span>{day.showLabel ? day.weekdayLabel : ""}</span>
              </div>
            ))}
          </div>

          {!hasAnyTimeInPeriod && <p className="week-chart__empty">За выбранный период пока нет закрытых интервалов</p>}
        </div>

        <aside className="top-tasks">
          <h2>Топ задач</h2>
          {topThreeTasks.length > 0 ? (
            topThreeTasks.map((task, index) => (
              <article className="top-task" key={task.id}>
                <span className="top-task__place">{index + 1}</span>
                <strong className="top-task__title">
                  <PriorityIcon priority={task.priority} />
                  <span>{task.title}</span>
                </strong>
                <span>{formatHumanDuration(task.total_time_seconds)}</span>
                <div className="top-task__progress">
                  <div className="top-task__progress-fill" style={{ width: `${Math.max(8, (task.total_time_seconds / maxTaskTime) * 100)}%` }} />
                </div>
              </article>
            ))
          ) : (
            <div className="status-message">Недостаточно данных для отчёта</div>
          )}
        </aside>
      </section>

      <section className="projects-report">
        <div className="projects-report__chart">
          <div>
            <h2>Время по проектам</h2>
            <p>Распределение общего времени по направлениям работы</p>
          </div>
          {hasProjectTime ? (
            <div className="projects-report__donut-wrap">
              <div
                className="projects-report__donut"
                style={{ background: buildProjectConicGradient(reports.projectsSummary) }}
                aria-hidden="true"
              />
              <div className="projects-report__legend">
                {reports.projectsSummary.items.slice(0, 6).map((project) => (
                  <div className="projects-report__legend-item" key={project.project_id ?? "none"}>
                    <span style={{ backgroundColor: project.color }} />
                    <strong>{project.name}</strong>
                    <em>{project.percentage.toFixed(1)}%</em>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="status-message">Пока нет времени по проектам</div>
          )}
        </div>

        <aside className="top-projects">
          <h2>Топ проектов</h2>
          {topProjects.length > 0 ? (
            topProjects.map((project, index) => (
              <article className="top-project" key={project.project_id ?? "none"}>
                <span className="top-project__place">{index + 1}</span>
                <strong className="top-project__title">
                  <span style={{ backgroundColor: project.color }} aria-hidden="true" />
                  <span>{project.name}</span>
                </strong>
                <span>{formatHumanDuration(project.total_time_seconds)}</span>
                <div className="top-project__progress">
                  <div
                    className="top-project__progress-fill"
                    style={{
                      width: `${Math.max(8, (project.total_time_seconds / maxProjectTime) * 100)}%`,
                      backgroundColor: project.color,
                    }}
                  />
                </div>
              </article>
            ))
          ) : (
            <div className="status-message">Недостаточно данных по проектам</div>
          )}
        </aside>
      </section>

    </main>
  );
}
