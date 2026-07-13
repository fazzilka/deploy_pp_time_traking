export type DeadlineStatus = "none" | "overdue" | "today" | "upcoming";

function parseDeadlineDate(value: string): Date | null {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (dateOnlyMatch) {
    const [, rawYear, rawMonth, rawDay] = dateOnlyMatch;
    const year = Number(rawYear);
    const month = Number(rawMonth);
    const day = Number(rawDay);
    if (!year || !month || !day) {
      return null;
    }
    return new Date(year, month - 1, day);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatDeadline(deadline: string | null, locale: "ru" | "en" = "ru"): string {
  if (!deadline) {
    return locale === "ru" ? "Без срока" : "No deadline";
  }

  const date = parseDeadlineDate(deadline);

  if (!date) {
    return deadline;
  }

  return new Intl.DateTimeFormat(
    locale === "ru" ? "ru-RU" : "en-US",
    locale === "ru"
      ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" },
  ).format(date);
}

export function getDeadlineStatus(deadline: string | null): DeadlineStatus {
  if (!deadline) {
    return "none";
  }

  const date = parseDeadlineDate(deadline);

  if (!date) {
    return "none";
  }

  const now = new Date();
  if (date.getTime() < now.getTime()) {
    return "overdue";
  }

  const today = startOfToday();
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return "today";
  }

  return "upcoming";
}

export function getDeadlineLabel(deadline: string | null, locale: "ru" | "en" = "ru"): string {
  if (!deadline) {
    return locale === "ru" ? "Без срока" : "No deadline";
  }

  const date = parseDeadlineDate(deadline);

  if (!date) {
    return locale === "ru" ? "Без срока" : "No deadline";
  }

  const now = new Date();
  if (date.getTime() < now.getTime()) {
    return locale === "ru" ? "Просрочено" : "Overdue";
  }

  const diffDays = Math.round((date.getTime() - startOfToday().getTime()) / 86_400_000);

  if (diffDays === 0) {
    return locale === "ru" ? "Сегодня" : "Today";
  }

  if (diffDays === 1) {
    return locale === "ru" ? "Завтра" : "Tomorrow";
  }

  return locale === "ru" ? `Осталось ${diffDays} дн.` : `${diffDays} days remaining`;
}
