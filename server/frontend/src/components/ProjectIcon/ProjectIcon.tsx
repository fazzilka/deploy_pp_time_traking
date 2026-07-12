import type { CSSProperties, ReactNode } from "react";
import { useLocale } from "../../i18n";
import "./ProjectIcon.css";

export type ProjectIconName =
  | "folder"
  | "money"
  | "book"
  | "graduation"
  | "pencil"
  | "pen"
  | "code"
  | "terminal"
  | "music"
  | "trash"
  | "brush"
  | "palette"
  | "stethoscope"
  | "flower"
  | "lotus"
  | "briefcase"
  | "chart"
  | "kettlebell"
  | "notebook"
  | "scales"
  | "globe"
  | "plane"
  | "wrench"
  | "paw"
  | "flask"
  | "brain"
  | "heart"
  | "plant"
  | "rocket"
  | "user"
  | "default";

type ProjectIconProps = {
  icon?: ProjectIconName | string | null;
  color?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

type ProjectIconPickerProps = {
  value: ProjectIconName;
  color?: string | null;
  onChange: (icon: ProjectIconName) => void;
  className?: string;
};

type ProjectIconSource = {
  name?: string | null;
  icon?: string | null;
};

const PROJECT_ICON_NAMES: ProjectIconName[] = [
  "folder",
  "money",
  "book",
  "graduation",
  "pencil",
  "pen",
  "code",
  "terminal",
  "music",
  "trash",
  "brush",
  "palette",
  "stethoscope",
  "flower",
  "lotus",
  "briefcase",
  "chart",
  "kettlebell",
  "notebook",
  "scales",
  "globe",
  "plane",
  "wrench",
  "paw",
  "flask",
  "brain",
  "heart",
  "plant",
  "rocket",
  "user",
  "default",
];

export const PROJECT_ICON_OPTIONS: Array<{ value: ProjectIconName; label: string }> = [
  { value: "folder", label: "Папка" },
  { value: "money", label: "Финансы" },
  { value: "book", label: "Книга" },
  { value: "graduation", label: "Обучение" },
  { value: "pencil", label: "Карандаш" },
  { value: "pen", label: "Перо" },
  { value: "code", label: "Код" },
  { value: "terminal", label: "Терминал" },
  { value: "music", label: "Музыка" },
  { value: "trash", label: "Корзина" },
  { value: "brush", label: "Кисть" },
  { value: "palette", label: "Палитра" },
  { value: "stethoscope", label: "Медицина" },
  { value: "flower", label: "Цветок" },
  { value: "lotus", label: "Лотос" },
  { value: "briefcase", label: "Портфель" },
  { value: "chart", label: "График" },
  { value: "kettlebell", label: "Спорт" },
  { value: "notebook", label: "Блокнот" },
  { value: "scales", label: "Весы" },
  { value: "globe", label: "Глобус" },
  { value: "plane", label: "Самолёт" },
  { value: "wrench", label: "Инструменты" },
  { value: "paw", label: "Лапа" },
  { value: "flask", label: "Колба" },
  { value: "brain", label: "Идеи" },
  { value: "heart", label: "Сердце" },
  { value: "plant", label: "Растение" },
  { value: "rocket", label: "Ракета" },
  { value: "user", label: "Пользователь" },
];

const ICONS: Record<ProjectIconName, ReactNode> = {
  folder: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
    </>
  ),
  money: (
    <>
      <rect x="4" y="7" width="16" height="10" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M7 10v4" />
      <path d="M17 10v4" />
    </>
  ),
  book: (
    <>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H20v15H7.5A2.5 2.5 0 0 0 5 21.5z" />
      <path d="M5 6.5v15" />
      <path d="M9 8h7" />
    </>
  ),
  graduation: (
    <>
      <path d="m3 9 9-4 9 4-9 4z" />
      <path d="M7 11v4c2.8 2 7.2 2 10 0v-4" />
      <path d="M21 9v6" />
    </>
  ),
  pencil: (
    <>
      <path d="m4 17 1 3 3-1 10-10-4-4z" />
      <path d="m13 6 4 4" />
    </>
  ),
  pen: (
    <>
      <path d="m12 19 7-7 1-7-7 1-7 7z" />
      <path d="m13 6 5 5" />
      <path d="M4 20l5-5" />
    </>
  ),
  code: (
    <>
      <path d="m9 9-4 3 4 3" />
      <path d="m15 9 4 3-4 3" />
      <path d="m13 7-2 10" />
    </>
  ),
  terminal: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="m8 10 3 2-3 2" />
      <path d="M13 15h4" />
    </>
  ),
  music: (
    <>
      <path d="M9 17V6l10-2v11" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="15" r="2" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14" />
      <path d="M9 7V5h6v2" />
      <path d="M8 10v8" />
      <path d="M12 10v8" />
      <path d="M16 10v8" />
      <path d="M7 7l1 13h8l1-13" />
    </>
  ),
  brush: (
    <>
      <path d="M14 4l6 6-8 8H6v-6z" />
      <path d="M4 20c1.5 0 3-.5 4-2" />
      <path d="m13 5 6 6" />
    </>
  ),
  palette: (
    <>
      <path d="M12 4a8 8 0 0 0 0 16h1.5a2 2 0 0 0 0-4H13a1 1 0 0 1 0-2h2a5 5 0 0 0-3-10z" />
      <circle cx="8.5" cy="10" r=".6" />
      <circle cx="10.5" cy="7.5" r=".6" />
      <circle cx="13.5" cy="8" r=".6" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M7 5v5a5 5 0 0 0 10 0V5" />
      <path d="M12 15v2a3 3 0 0 0 6 0v-1" />
      <circle cx="19" cy="15" r="1" />
    </>
  ),
  flower: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 4c2 2.5 2 5.5 0 8-2-2.5-2-5.5 0-8z" />
      <path d="M12 20c-2-2.5-2-5.5 0-8 2 2.5 2 5.5 0 8z" />
      <path d="M4 12c2.5-2 5.5-2 8 0-2.5 2-5.5 2-8 0z" />
      <path d="M20 12c-2.5 2-5.5 2-8 0 2.5-2 5.5-2 8 0z" />
    </>
  ),
  lotus: (
    <>
      <path d="M12 19c-3-2-4-5-3-9 2 1 3 3 3 6 0-3 1-5 3-6 1 4 0 7-3 9z" />
      <path d="M5 13c3 0 5 2 7 6-4 0-7-2-7-6z" />
      <path d="M19 13c0 4-3 6-7 6 2-4 4-6 7-6z" />
    </>
  ),
  briefcase: (
    <>
      <rect x="4" y="7" width="16" height="12" rx="2" />
      <path d="M9 7V5h6v2" />
      <path d="M4 12h16" />
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
  kettlebell: (
    <>
      <path d="M9 9V7a3 3 0 0 1 6 0v2" />
      <path d="M7 10h10l2 8H5z" />
    </>
  ),
  notebook: (
    <>
      <rect x="6" y="4" width="13" height="16" rx="2" />
      <path d="M10 8h5" />
      <path d="M10 12h5" />
      <path d="M4 8h3" />
      <path d="M4 12h3" />
      <path d="M4 16h3" />
    </>
  ),
  scales: (
    <>
      <path d="M12 4v16" />
      <path d="M6 7h12" />
      <path d="m6 7-3 5h6z" />
      <path d="m18 7-3 5h6z" />
      <path d="M8 20h8" />
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
  plane: (
    <>
      <path d="M4 12 20 5l-7 15-2-6z" />
      <path d="M11 14 20 5" />
    </>
  ),
  wrench: (
    <>
      <path d="M14 6a4 4 0 0 0 5 5L10 20l-4-4 9-9a4 4 0 0 1-1-1z" />
      <path d="m7 17 2 2" />
    </>
  ),
  paw: (
    <>
      <circle cx="7" cy="8" r="1.5" />
      <circle cx="12" cy="6" r="1.5" />
      <circle cx="17" cy="8" r="1.5" />
      <path d="M7.5 17a4.5 4.5 0 0 1 9 0c0 1.5-1.4 2-4.5 2s-4.5-.5-4.5-2z" />
    </>
  ),
  flask: (
    <>
      <path d="M9 4h6" />
      <path d="M10 4v5l-4.5 8A2 2 0 0 0 7.2 20h9.6a2 2 0 0 0 1.7-3L14 9V4" />
      <path d="M8 16h8" />
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
  heart: (
    <>
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
    </>
  ),
  plant: (
    <>
      <path d="M12 20V9" />
      <path d="M12 12c-4.5 0-6-2.5-6-6 4.5 0 6 2.5 6 6z" />
      <path d="M12 14c4.5 0 6-2.5 6-6-4.5 0-6 2.5-6 6z" />
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
  const iconName = isProjectIconName(icon) ? icon : "folder";
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

export function ProjectIconPicker({ value, color, onChange, className = "" }: ProjectIconPickerProps) {
  const { text } = useLocale();
  const classes = ["project-icon-picker", className].filter(Boolean).join(" ");

  return (
    <div className={classes} aria-label={text("Иконка проекта", "Project icon")}>
      {PROJECT_ICON_OPTIONS.map((option) => (
        <button
          className={`project-icon-picker__option${value === option.value ? " project-icon-picker__option--active" : ""}`}
          key={option.value}
          type="button"
          style={{ "--project-icon-color": getSafeProjectColor(color) } as CSSProperties}
          onClick={() => onChange(option.value)}
          aria-label={text(`Выбрать иконку ${option.label}`, `Choose ${option.value} icon`)}
          aria-pressed={value === option.value}
        >
          <ProjectIcon icon={option.value} color={value === option.value ? color : "#30363d"} size="md" />
        </button>
      ))}
    </div>
  );
}
