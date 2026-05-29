import "./StatCard.css";

type StatCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  accent?: "green" | "blue" | "yellow" | "red";
};

export function StatCard({ title, value, subtitle, accent = "green" }: StatCardProps) {
  return (
    <article className={`report-stat-card report-stat-card--${accent}`}>
      <p className="report-stat-card__label">{title}</p>
      <div className="report-stat-card__value">{value}</div>
      {subtitle && <p className="report-stat-card__sub">{subtitle}</p>}
    </article>
  );
}
