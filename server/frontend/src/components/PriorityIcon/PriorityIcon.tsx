import type { TaskPriority } from "../../shared/types/task";
import "./PriorityIcon.css";

type PriorityIconProps = {
  priority: TaskPriority;
  showLabel?: boolean;
};

export const priorityMeta: Record<TaskPriority, { label: string; icon: string }> = {
  highest: { label: "Highest", icon: "⇈" },
  high: { label: "High", icon: "↑" },
  medium: { label: "Medium", icon: "=" },
  low: { label: "Low", icon: "↓" },
  lowest: { label: "Lowest", icon: "⇊" },
};

export function PriorityIcon({ priority, showLabel = false }: PriorityIconProps) {
  const meta = priorityMeta[priority];

  return (
    <span className={`priority-icon priority-icon--${priority}`} title={`Priority: ${meta.label}`}>
      <span className="priority-icon__glyph" aria-hidden="true">
        {meta.icon}
      </span>
      {showLabel && <span className="priority-icon__label">{meta.label}</span>}
    </span>
  );
}
