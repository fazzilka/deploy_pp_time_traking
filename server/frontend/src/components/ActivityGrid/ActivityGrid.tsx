import type { ActivityDay } from "../../shared/types/reports";
import { normalizeActivityDays } from "../../shared/utils/activity";
import { formatHumanDuration } from "../../shared/utils/time";
import "./ActivityGrid.css";

type ActivityGridProps = {
  days: ActivityDay[];
  year: number;
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ActivityGrid({ days, year }: ActivityGridProps) {
  const cells = normalizeActivityDays(days, year);
  const totalContributions = days.reduce((sum, day) => sum + day.intervals_count, 0);

  return (
    <section className="activity-section">
      <div className="activity-header">
        <h2>{totalContributions} contributions in the last year</h2>
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
                <span>Mon</span>
                <span>Wed</span>
                <span>Fri</span>
              </div>

              <div className="activity-grid" aria-label={`Активность за ${year} год`}>
                {cells.map((day) => (
                  <span
                    key={day.date}
                    className="activity-cell"
                    data-level={day.level}
                    title={`${day.date}: ${formatHumanDuration(day.total_time_seconds)}, ${day.intervals_count} интервалов`}
                  />
                ))}
              </div>
            </div>

            <div className="activity-footer">
              <span>Less activity</span>
              <div className="activity-legend" aria-hidden="true">
                <span>Less</span>
                {[0, 1, 2, 3, 4].map((level) => (
                  <span key={level} className="activity-cell" data-level={level} />
                ))}
                <span>More</span>
              </div>
            </div>
          </div>
        </div>

        <div className="activity-years" aria-label="Текущий год">
          <div className="activity-year activity-year--active">{year}</div>
        </div>
      </div>
    </section>
  );
}
