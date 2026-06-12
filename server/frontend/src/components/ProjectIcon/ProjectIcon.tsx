import type { CSSProperties, ReactNode } from "react";
import "./ProjectIcon.css";

export type ProjectIconName =
  | "code"
  | "book"
  | "globe"
  | "rocket"
  | "user"
  | "briefcase"
  | "folder"
  | "chart"
  | "pencil"
  | "terminal"
  | "heart"
  | "brain"
  | "flask"
  | "plant"
  | "music"
  | "default";

type ProjectIconProps = {
  icon?: ProjectIconName | string | null;
  color?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

type ProjectIconSource = {
  name?: string | null;
  icon?: string | null;
};

const PROJECT_ICON_NAMES: ProjectIconName[] = [
  "code",
  "book",
  "globe",
  "rocket",
  "user",
  "briefcase",
  "folder",
  "chart",
  "pencil",
  "terminal",
  "heart",
  "brain",
  "flask",
  "plant",
  "music",
  "default",
];

const ICONS: Record<ProjectIconName, ReactNode> = {
  code: (
    <>
      <path d="m9 9-4 3 4 3" />
      <path d="m15 9 4 3-4 3" />
      <path d="m13 7-2 10" />
    </>
  ),
  book: (
    <>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H20v15H7.5A2.5 2.5 0 0 0 5 21.5z" />
      <path d="M5 6.5v15" />
      <path d="M9 8h7" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16" />
      <path d="M12 4a12 12 0 0 1 0 16" />
      <path d="M12 4a12 12 0 0 0 0 16" />
    </>
  ),
  rocket: (
    <>
      <path d="M13 4c3.2.6 5.4 2.8 6 6l-6.5 6.5-5-5z" />
      <path d="M8 16l-3 3 1-4" />
      <path d="M8 8l-4 1 3-3" />
      <circle cx="14.5" cy="8.5" r="1.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  briefcase: (
    <>
      <rect x="4" y="7" width="16" height="12" rx="2" />
      <path d="M9 7V5h6v2" />
      <path d="M4 12h16" />
    </>
  ),
  folder: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
    </>
  ),
  chart: (
    <>
      <path d="M5 19V5" />
      <path d="M5 19h14" />
      <rect x="8" y="12" width="2.5" height="4" rx="1" />
      <rect x="12" y="8" width="2.5" height="8" rx="1" />
      <rect x="16" y="10" width="2.5" height="6" rx="1" />
    </>
  ),
  pencil: (
    <>
      <path d="m4 17 1 3 3-1 10-10-4-4z" />
      <path d="m13 6 4 4" />
    </>
  ),
  terminal: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="m8 10 3 2-3 2" />
      <path d="M13 15h4" />
    </>
  ),
  heart: (
    <>
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
    </>
  ),
  brain: (
    <>
      <path d="M9 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5.6A3.5 3.5 0 0 0 9 19" />
      <path d="M15 5a3 3 0 0 1 3 3 3 3 0 0 1 1 5.6A3.5 3.5 0 0 1 15 19" />
      <path d="M9 5v14" />
      <path d="M15 5v14" />
      <path d="M9 9h6" />
      <path d="M9 14h6" />
    </>
  ),
  flask: (
    <>
      <path d="M9 4h6" />
      <path d="M10 4v5l-4.5 8A2 2 0 0 0 7.2 20h9.6a2 2 0 0 0 1.7-3L14 9V4" />
      <path d="M8 16h8" />
    </>
  ),
  plant: (
    <>
      <path d="M12 20V9" />
      <path d="M12 12c-4.5 0-6-2.5-6-6 4.5 0 6 2.5 6 6z" />
      <path d="M12 14c4.5 0 6-2.5 6-6-4.5 0-6 2.5-6 6z" />
    </>
  ),
  music: (
    <>
      <path d="M9 17V6l10-2v11" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="15" r="2" />
    </>
  ),
  default: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <path d="M8 12h8" />
    </>
  ),
};

function isProjectIconName(icon: string | null | undefined): icon is ProjectIconName {
  return PROJECT_ICON_NAMES.includes(icon as ProjectIconName);
}

function getSafeProjectColor(color: string | null | undefined): string {
  return /^#[0-9a-fA-F]{6}$/.test(color ?? "") ? color ?? "#2ea043" : "#2ea043";
}

export function getProjectFallbackIcon(project: ProjectIconSource | null | undefined): ProjectIconName {
  if (isProjectIconName(project?.icon)) {
    return project.icon;
  }

  const name = project?.name?.toLowerCase() ?? "";

  if (name.includes("backend") || name.includes("api") || name.includes("разработ")) {
    return "code";
  }

  if (name.includes("учёб") || name.includes("study") || name.includes("книг")) {
    return "book";
  }

  if (name.includes("сайт") || name.includes("client") || name.includes("клиент") || name.includes("web")) {
    return "globe";
  }

  if (name.includes("деплой") || name.includes("deploy") || name.includes("релиз")) {
    return "rocket";
  }

  if (name.includes("личн") || name.includes("personal")) {
    return "user";
  }

  if (name.includes("музык") || name.includes("music")) {
    return "music";
  }

  if (name.includes("аналит") || name.includes("report") || name.includes("отч")) {
    return "chart";
  }

  if (name.includes("работ") || name.includes("business")) {
    return "briefcase";
  }

  return "folder";
}

export function ProjectIcon({ icon, color, size = "md", className = "" }: ProjectIconProps) {
  const iconName = isProjectIconName(icon) ? icon : "default";
  const classes = ["project-icon", `project-icon--${size}`, className].filter(Boolean).join(" ");
  const style = { "--project-icon-color": getSafeProjectColor(color) } as CSSProperties;

  return (
    <span className={classes} style={style} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        {ICONS[iconName]}
      </svg>
    </span>
  );
}
