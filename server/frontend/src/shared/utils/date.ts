export type DeadlineStatus = "none" | "overdue" | "today" | "upcoming";

function parseDateOnly(value: string): Date | null {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatDeadline(deadline: string | null): string {
  if (!deadline) {
    return "Без срока";
  }

  const date = parseDateOnly(deadline);

  if (!date) {
    return deadline;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function getDeadlineStatus(deadline: string | null): DeadlineStatus {
  if (!deadline) {
    return "none";
  }

  const date = parseDateOnly(deadline);

  if (!date) {
    return "none";
  }

  const today = startOfToday();
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) {
    return "overdue";
  }

  if (diffDays === 0) {
    return "today";
  }

  return "upcoming";
}

export function getDeadlineLabel(deadline: string | null): string {
  if (!deadline) {
    return "Без срока";
  }

  const date = parseDateOnly(deadline);

  if (!date) {
    return "Без срока";
  }

  const diffDays = Math.round((date.getTime() - startOfToday().getTime()) / 86_400_000);

  if (diffDays < 0) {
    return "Просрочено";
  }

  if (diffDays === 0) {
    return "Сегодня";
  }

  if (diffDays === 1) {
    return "Завтра";
  }

  return `Осталось ${diffDays} дн.`;
}
