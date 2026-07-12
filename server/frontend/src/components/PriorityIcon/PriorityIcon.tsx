import type { TaskPriority } from "../../shared/types/task";
import { useLocale } from "../../i18n";
import "./PriorityIcon.css";

type PriorityIconProps = {
  priority: TaskPriority;
  showLabel?: boolean;
};

export const priorityMeta: Record<TaskPriority, { icon: string }> = {
  highest: { icon: "⇈" }, high: { icon: "↑" }, medium: { icon: "=" }, low: { icon: "↓" }, lowest: { icon: "⇊" },
};

export function PriorityIcon({ priority, showLabel = false }: PriorityIconProps) {
  const { t } = useLocale();
  const meta = priorityMeta[priority];
  const label = t(`tasks.priority.${priority}`);

  return (
    <span className={`priority-icon priority-icon--${priority}`} title={t("tasks.priority.label", { priority: label })}>
      <span className="priority-icon__glyph" aria-hidden="true">
        {meta.icon}
      </span>
      {showLabel && <span className="priority-icon__label">{label}</span>}
    </span>
  );
}
