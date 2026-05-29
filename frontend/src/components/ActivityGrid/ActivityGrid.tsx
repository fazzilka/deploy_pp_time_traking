import type { ActivityDay } from "../../shared/types/reports";
import { normalizeActivityDays } from "../../shared/utils/activity";
import { formatHumanDuration } from "../../shared/utils/time";
import "./ActivityGrid.css";

type ActivityGridProps = {
  days: ActivityDay[];
  selectedYear: number;
  onYearChange: (year: number) => void;
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const years = [2026, 2025, 2024];

export function ActivityGrid({ days, selectedYear, onYearChange }: ActivityGridProps) {
  const cells = normalizeActivityDays(days, selectedYear);
  const totalContributions = days.reduce((sum, day) => sum + day.intervals_count, 0);

  return (
    <section className="activity-section">
      <div className="activity-header">
        <h2>{totalContributions} contributions in the last year</h2>
        <button type="button">Contribution settings</button>
      </div>

      <div className="activity-area">
        <div className="activity-card">
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

            <div className="activity-grid" aria-label={`Активность за ${selectedYear} год`}>
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
            <span>Learn how we count activity</span>
            <div className="activity-legend" aria-hidden="true">
              <span>Less</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <span key={level} className="activity-cell" data-level={level} />
              ))}
              <span>More</span>
            </div>
          </div>
        </div>

        <div className="activity-years" aria-label="Выбор года">
          {years.map((year) => (
            <button
              key={year}
              className={`activity-year${year === selectedYear ? " active" : ""}`}
              type="button"
              onClick={() => onYearChange(year)}
            >
              {year}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
