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

function getDurationParts(durationMs: number) {
  const totalMinutes = Math.floor(durationMs / MINUTE_MS);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  return {
    days,
    hours,
    minutes,
    totalMinutes,
  };
}

function formatParts(days: number, hours: number, minutes: number): string {
  if (days > 0) {
    return `${days} д ${hours} ч ${minutes} м`;
  }

  if (hours > 0) {
    return `${hours} ч ${minutes} м`;
  }

  if (minutes > 0) {
    return `${minutes} м`;
  }

  return "меньше 1 м";
}

function formatRemainingDuration(diffMs: number): string {
  const { days, hours, minutes } = getDurationParts(diffMs);
  return formatParts(days, hours, minutes);
}

function formatOverdueDuration(overdueMs: number): string {
  const { days, hours, minutes } = getDurationParts(overdueMs);
  return `Просрочено на ${formatParts(days, hours, minutes)}`;
}

function formatRemainingDurationCompact(diffMs: number): string {
  const { days, hours, minutes } = getDurationParts(diffMs);

  if (days > 0) {
    return hours > 0 ? `${days} д ${hours} ч` : `${days} д`;
  }

  if (hours > 0) {
    return `${hours} ч ${minutes} м`;
  }

  if (minutes > 0) {
    return `${minutes} м`;
  }

  return "меньше 1 м";
}

function formatOverdueDurationCompact(overdueMs: number): string {
  const { days, hours, minutes } = getDurationParts(overdueMs);

  if (days > 0) {
    return hours > 0 ? `${days} д ${hours} ч` : `${days} д`;
  }

  if (hours > 0) {
    return `${hours} ч`;
  }

  if (minutes > 0) {
    return `${minutes} м`;
  }

  return "меньше 1 м";
}

function getCountdownStatus(totalMinutes: number, isOverdue: boolean): DeadlineCountdownStatus {
  if (isOverdue) {
    return "overdue";
  }

  if (totalMinutes <= 24 * 60) {
    return "danger";
  }

  if (totalMinutes <= 3 * 24 * 60) {
    return "warning";
  }

  return "safe";
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
      status: getCountdownStatus(totalMinutes, true),
      isOverdue: true,
      totalMinutes,
    };
  }

  return {
    label: formatRemainingDuration(diffMs),
    status: getCountdownStatus(totalMinutes, false),
    isOverdue: false,
    totalMinutes,
  };
}

export function formatDeadlineCountdownCompact(
  deadline: string | null | undefined,
  now = new Date(),
): DeadlineCountdown {
  if (!deadline) {
    return {
      label: "без срока",
      status: "none",
      isOverdue: false,
      totalMinutes: null,
    };
  }

  const deadlineDate = parseDeadlineDate(deadline);
  if (!deadlineDate) {
    return {
      label: "без срока",
      status: "none",
      isOverdue: false,
      totalMinutes: null,
    };
  }

  const diffMs = deadlineDate.getTime() - now.getTime();
  const totalMinutes = Math.floor(diffMs / MINUTE_MS);

  if (diffMs < 0) {
    return {
      label: `просрочено ${formatOverdueDurationCompact(Math.abs(diffMs))}`,
      status: getCountdownStatus(totalMinutes, true),
      isOverdue: true,
      totalMinutes,
    };
  }

  return {
    label: `осталось ${formatRemainingDurationCompact(diffMs)}`,
    status: getCountdownStatus(totalMinutes, false),
    isOverdue: false,
    totalMinutes,
  };
}
