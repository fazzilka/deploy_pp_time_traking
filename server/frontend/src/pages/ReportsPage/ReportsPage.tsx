import { useEffect, useMemo, useState } from "react";
import { PriorityIcon } from "../../components/PriorityIcon/PriorityIcon";
import { StatCard } from "../../components/StatCard/StatCard";
import { getReportsData } from "../../shared/api/reports";
import type { ActivityDay, SummaryResponse } from "../../shared/types/reports";
import type { Task } from "../../shared/types/task";
import { getBestActivityDay, getLastDays } from "../../shared/utils/activity";
import { formatHumanDuration } from "../../shared/utils/time";
import "./ReportsPage.css";

const weekdayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

type ReportsState = {
  summary: SummaryResponse;
  tasks: Task[];
  days: ActivityDay[];
};

function getWeekDays(days: ActivityDay[]): ActivityDay[] {
  const lastDays = getLastDays(days, 7);

  if (lastDays.length === 7) {
    return lastDays;
  }

  return [
    ...Array.from({ length: 7 - lastDays.length }, (_, index): ActivityDay => ({
      date: `empty-${index}`,
      intervals_count: 0,
      total_time_seconds: 0,
      level: 0,
    })),
    ...lastDays,
  ];
}

export function ReportsPage() {
  const [reports, setReports] = useState<ReportsState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReports() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getReportsData(2026);
        setReports({
          summary: data.summary,
          tasks: data.tasks,
          days: data.activity.days,
        });
      } catch {
        setError("Не удалось загрузить отчёты");
      } finally {
        setIsLoading(false);
      }
    }

    void loadReports();
  }, []);

  const stats = useMemo(() => {
    if (!reports) {
      return null;
    }

    const activeDays = reports.days.filter((day) => day.total_time_seconds > 0);
    const totalActivityTime = reports.days.reduce((sum, day) => sum + day.total_time_seconds, 0);
    const bestDay = getBestActivityDay(reports.days);

    return {
      tasksWithTime: reports.tasks.filter((task) => task.total_time_seconds > 0).length,
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

  const weekDays = getWeekDays(reports.days);
  const maxWeekTime = Math.max(...weekDays.map((day) => day.total_time_seconds), 1);
  const topThreeTasks = reports.summary.top_tasks.slice(0, 3);
  const maxTaskTime = Math.max(...topThreeTasks.map((task) => task.total_time_seconds), 1);

  return (
    <main className="reports-page app-container">
      <section className="reports-header">
        <div>
          <p className="eyebrow">Аналитика</p>
          <h1 className="reports-title">Отчёты по времени</h1>
          <p className="page-copy">Сводка времени, динамика за неделю и задачи, которые забрали больше всего внимания.</p>
        </div>

        <select className="reports-period" defaultValue="7days" aria-label="Период отчёта">
          <option value="7days">Последние 7 дней</option>
          <option value="30days">Последние 30 дней</option>
        </select>
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
              <p>Последние 7 дней</p>
            </div>
          </div>

          <div className="week-chart__bars">
            {weekDays.map((day, index) => {
              const height = Math.max(8, Math.round((day.total_time_seconds / maxWeekTime) * 190));

              return (
                <div className="week-chart__bar-wrap" key={`${day.date}-${index}`}>
                  <div className="week-chart__bar" title={`${day.date}: ${formatHumanDuration(day.total_time_seconds)}`}>
                    <div className="week-chart__bar-fill" style={{ height: `${height}px` }} />
                  </div>
                  <span>{weekdayLabels[index]}</span>
                </div>
              );
            })}
          </div>
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

    </main>
  );
}
