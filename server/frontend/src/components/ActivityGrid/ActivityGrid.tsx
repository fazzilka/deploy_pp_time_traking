import type { ActivityDay } from "../../shared/types/reports";
import { normalizeActivityDays } from "../../shared/utils/activity";
import { formatHumanDuration } from "../../shared/utils/time";
import { useLocale } from "../../i18n";
import "./ActivityGrid.css";

type ActivityGridProps = {
  days: ActivityDay[];
  year: number;
};

export function ActivityGrid({ days, year }: ActivityGridProps) {
  const { locale, text } = useLocale();
  const months = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { month: "short" }).format(new Date(year, month, 1)));
  const cells = normalizeActivityDays(days, year);
  const totalContributions = days.reduce((sum, day) => sum + day.intervals_count, 0);

  return (
    <section className="activity-section">
      <div className="activity-header">
        <h2>{text(`${totalContributions} действий за последний год`, `${totalContributions} contributions in the last year`)}</h2>
      </div>

      <div className="activity-area">
        <div className="activity-card">
          <div className="activity-grid-shell">
            <div className="activity-months" aria-hidden="true">
              {months.map((month) => (
                <span key={month}>{month}</span>
              ))}
            </div>

            <div className="activity-body">
              <div className="activity-weekdays" aria-hidden="true">
                <span>{text("Пн", "Mon")}</span><span>{text("Ср", "Wed")}</span><span>{text("Пт", "Fri")}</span>
              </div>

              <div className="activity-grid" aria-label={text(`Активность за ${year} год`, `Activity for ${year}`)}>
                {cells.map((day) => (
                  <span
                    key={day.date}
                    className="activity-cell"
                    data-level={day.level}
                    title={`${day.date}: ${formatHumanDuration(day.total_time_seconds, locale)}, ${day.intervals_count} ${text("интервалов", "intervals")}`}
                  />
                ))}
              </div>
            </div>

            <div className="activity-footer">
              <span>{text("Меньше активности", "Less activity")}</span>
              <div className="activity-legend" aria-hidden="true">
                <span>{text("Меньше", "Less")}</span>
                {[0, 1, 2, 3, 4].map((level) => (
                  <span key={level} className="activity-cell" data-level={level} />
                ))}
                <span>{text("Больше", "More")}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="activity-years" aria-label={text("Текущий год", "Current year")}>
          <div className="activity-year activity-year--active">{year}</div>
        </div>
      </div>
    </section>
  );
}
