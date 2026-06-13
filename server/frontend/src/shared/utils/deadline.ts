export type DeadlineCountdownStatus = "none" | "safe" | "warning" | "danger" | "overdue";

export type DeadlineCountdown = {
  label: string;
  status: DeadlineCountdownStatus;
  isOverdue: boolean;
  totalMinutes: number | null;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDeadlineDate(deadline: string): Date | null {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline);

  if (dateOnlyMatch) {
    const [, rawYear, rawMonth, rawDay] = dateOnlyMatch;
    const year = Number(rawYear);
    const month = Number(rawMonth);
    const day = Number(rawDay);

    if (!year || !month || !day) {
      return null;
    }

    return new Date(year, month - 1, day, 23, 59, 59, 999);
  }

  const date = new Date(deadline);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRemainingDuration(diffMs: number): string {
  const days = Math.floor(diffMs / DAY_MS);
  const hours = Math.floor((diffMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((diffMs % HOUR_MS) / MINUTE_MS);

  if (days > 0) {
    return `${days} д ${pad(hours)} ч ${pad(minutes)} мин`;
  }

  if (hours > 0) {
    return `${hours} ч ${pad(minutes)} мин`;
  }

  if (minutes > 0) {
    return `${minutes} мин`;
  }

  return "меньше минуты";
}

function formatOverdueDuration(overdueMs: number): string {
  const days = Math.floor(overdueMs / DAY_MS);
  const hours = Math.floor((overdueMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((overdueMs % HOUR_MS) / MINUTE_MS);

  if (days > 0) {
    return `Просрочено на ${days} д ${pad(hours)} ч`;
  }

  if (hours > 0) {
    return `Просрочено на ${hours} ч ${pad(minutes)} мин`;
  }

  if (minutes > 0) {
    return `Просрочено на ${minutes} мин`;
  }

  return "Просрочено меньше минуты";
}

export function formatDeadlineCountdown(
  deadline: string | null | undefined,
  now = new Date(),
): DeadlineCountdown {
  if (!deadline) {
    return {
      label: "Дедлайн не задан",
      status: "none",
      isOverdue: false,
      totalMinutes: null,
    };
  }

  const deadlineDate = parseDeadlineDate(deadline);
  if (!deadlineDate) {
    return {
      label: "Дедлайн не задан",
      status: "none",
      isOverdue: false,
      totalMinutes: null,
    };
  }

  const diffMs = deadlineDate.getTime() - now.getTime();
  const totalMinutes = Math.floor(diffMs / MINUTE_MS);

  if (diffMs < 0) {
    return {
      label: formatOverdueDuration(Math.abs(diffMs)),
      status: "overdue",
      isOverdue: true,
      totalMinutes,
    };
  }

  if (totalMinutes <= 24 * 60) {
    return {
      label: formatRemainingDuration(diffMs),
      status: "danger",
      isOverdue: false,
      totalMinutes,
    };
  }

  if (totalMinutes <= 3 * 24 * 60) {
    return {
      label: formatRemainingDuration(diffMs),
      status: "warning",
      isOverdue: false,
      totalMinutes,
    };
  }

  return {
    label: formatRemainingDuration(diffMs),
    status: "safe",
    isOverdue: false,
    totalMinutes,
  };
}
