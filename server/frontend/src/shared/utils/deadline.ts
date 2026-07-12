export type DeadlineCountdownStatus = "none" | "safe" | "warning" | "danger" | "overdue";

export type DeadlineCountdown = {
  label: string;
  status: DeadlineCountdownStatus;
  isOverdue: boolean;
  totalMinutes: number | null;
};

const MINUTE_MS = 60_000;

export function datetimeLocalToUtcIso(value: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function utcIsoToDatetimeLocal(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (part: number) => String(part).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function formatParts(days: number, hours: number, minutes: number, locale: "ru" | "en"): string {
  if (days > 0) {
    return locale === "ru" ? `${days} д ${hours} ч ${minutes} мин` : `${days} d ${hours} hr ${minutes} min`;
  }

  if (hours > 0) {
    return locale === "ru" ? `${hours} ч ${minutes} мин` : `${hours} hr ${minutes} min`;
  }

  if (minutes > 0) {
    return locale === "ru" ? `${minutes} мин` : `${minutes} min`;
  }

  return locale === "ru" ? "меньше 1 мин" : "less than 1 min";
}

function formatRemainingDuration(diffMs: number, locale: "ru" | "en"): string {
  const { days, hours, minutes } = getDurationParts(diffMs);
  return formatParts(days, hours, minutes, locale);
}

function formatOverdueDuration(overdueMs: number, locale: "ru" | "en"): string {
  const { days, hours, minutes } = getDurationParts(overdueMs);
  const duration = formatParts(days, hours, minutes, locale);
  return locale === "ru" ? `Просрочено на ${duration}` : `Overdue by ${duration}`;
}

function formatRemainingDurationCompact(diffMs: number, locale: "ru" | "en"): string {
  const duration = formatRemainingDuration(diffMs, locale);
  return locale === "ru" ? `Осталось ${duration}` : `${duration} remaining`;
}

function formatOverdueDurationCompact(overdueMs: number, locale: "ru" | "en"): string {
  return formatOverdueDuration(overdueMs, locale);
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
  locale: "ru" | "en" = "ru",
): DeadlineCountdown {
  if (!deadline) {
    return {
      label: locale === "ru" ? "Дедлайн не задан" : "Deadline not set",
      status: "none",
      isOverdue: false,
      totalMinutes: null,
    };
  }

  const deadlineDate = parseDeadlineDate(deadline);
  if (!deadlineDate) {
    return {
      label: locale === "ru" ? "Дедлайн не задан" : "Deadline not set",
      status: "none",
      isOverdue: false,
      totalMinutes: null,
    };
  }

  const diffMs = deadlineDate.getTime() - now.getTime();
  const totalMinutes = Math.floor(diffMs / MINUTE_MS);

  if (diffMs < 0) {
    return {
      label: formatOverdueDuration(Math.abs(diffMs), locale),
      status: getCountdownStatus(totalMinutes, true),
      isOverdue: true,
      totalMinutes,
    };
  }

  return {
    label: formatRemainingDuration(diffMs, locale),
    status: getCountdownStatus(totalMinutes, false),
    isOverdue: false,
    totalMinutes,
  };
}

export function formatDeadlineCountdownCompact(
  deadline: string | null | undefined,
  now = new Date(),
  locale: "ru" | "en" = "ru",
): DeadlineCountdown {
  if (!deadline) {
    return {
      label: locale === "ru" ? "Без срока" : "No deadline",
      status: "none",
      isOverdue: false,
      totalMinutes: null,
    };
  }

  const deadlineDate = parseDeadlineDate(deadline);
  if (!deadlineDate) {
    return {
      label: locale === "ru" ? "Без срока" : "No deadline",
      status: "none",
      isOverdue: false,
      totalMinutes: null,
    };
  }

  const diffMs = deadlineDate.getTime() - now.getTime();
  const totalMinutes = Math.floor(diffMs / MINUTE_MS);

  if (diffMs < 0) {
    return {
      label: formatOverdueDurationCompact(Math.abs(diffMs), locale),
      status: getCountdownStatus(totalMinutes, true),
      isOverdue: true,
      totalMinutes,
    };
  }

  return {
    label: formatRemainingDurationCompact(diffMs, locale),
    status: getCountdownStatus(totalMinutes, false),
    isOverdue: false,
    totalMinutes,
  };
}
