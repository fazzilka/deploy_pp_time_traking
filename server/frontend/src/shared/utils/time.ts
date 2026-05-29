function clampSeconds(seconds: number): number {
  return Math.max(0, Math.floor(seconds));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDuration(seconds: number): string {
  const safeSeconds = clampSeconds(seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const restSeconds = safeSeconds % 60;

  return `${pad(hours)}:${pad(minutes)}:${pad(restSeconds)}`;
}

export function formatHumanDuration(seconds: number): string {
  const safeSeconds = clampSeconds(seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes} мин`;
  }

  if (minutes <= 0) {
    return `${hours} ч`;
  }

  return `${hours} ч ${minutes} мин`;
}

export function getElapsedSeconds(startedAt: string): number {
  return clampSeconds((Date.now() - new Date(startedAt).getTime()) / 1000);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}
