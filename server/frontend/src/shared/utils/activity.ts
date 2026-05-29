import type { ActivityDay, ActivityLevel } from "../types/reports";

const dayMs = 24 * 60 * 60 * 1000;

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function getActivityLevel(totalSeconds: number): ActivityLevel {
  if (totalSeconds <= 0) {
    return 0;
  }

  if (totalSeconds < 30 * 60) {
    return 1;
  }

  if (totalSeconds < 2 * 60 * 60) {
    return 2;
  }

  if (totalSeconds < 4 * 60 * 60) {
    return 3;
  }

  return 4;
}

export function normalizeActivityDays(days: ActivityDay[], year: number): ActivityDay[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const end = startOfUtcDay(yearEnd);
  const start = new Date(end.getTime() - 370 * dayMs);
  const normalized: ActivityDay[] = [];

  for (let time = start.getTime(); time <= end.getTime(); time += dayMs) {
    const current = new Date(time);
    const date = toDateKey(current);

    normalized.push(
      byDate.get(date) ?? {
        date,
        intervals_count: 0,
        total_time_seconds: 0,
        level: 0,
      },
    );
  }

  const yearDays = normalized.filter((day) => {
    const date = new Date(day.date);
    return date >= yearStart && date <= yearEnd;
  });

  const firstDay = new Date(yearDays[0]?.date ?? `${year}-01-01`);
  const prefixCount = firstDay.getUTCDay() === 0 ? 6 : firstDay.getUTCDay() - 1;
  const prefixed = Array.from({ length: prefixCount }, (_, index): ActivityDay => {
    const date = new Date(firstDay.getTime() - (prefixCount - index) * dayMs);
    return {
      date: toDateKey(date),
      intervals_count: 0,
      total_time_seconds: 0,
      level: 0,
    };
  });

  const cells = [...prefixed, ...yearDays].slice(-371);

  while (cells.length < 371) {
    const lastDate = new Date(cells[cells.length - 1]?.date ?? `${year}-01-01`);
    const next = new Date(lastDate.getTime() + dayMs);
    cells.push({
      date: toDateKey(next),
      intervals_count: 0,
      total_time_seconds: 0,
      level: 0,
    });
  }

  return cells.slice(0, 371);
}

export function getLastDays(days: ActivityDay[], count: number): ActivityDay[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date)).slice(-count);
}

export function getBestActivityDay(days: ActivityDay[]): ActivityDay | null {
  return days.reduce<ActivityDay | null>((best, day) => {
    if (!best || day.total_time_seconds > best.total_time_seconds) {
      return day;
    }

    return best;
  }, null);
}
