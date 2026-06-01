import { PriorityIcon, priorityMeta } from "../PriorityIcon/PriorityIcon";
import type { TaskPriority } from "../../shared/types/task";
import "./PrioritySelect.css";

type PrioritySelectProps = {
  value: TaskPriority;
  onChange: (value: TaskPriority) => void;
};

const priorities: TaskPriority[] = ["highest", "high", "medium", "low", "lowest"];

export function PrioritySelect({ value, onChange }: PrioritySelectProps) {
  return (
    <div className="priority-select">
      <span className="priority-select__icon" aria-hidden="true">
        <PriorityIcon priority={value} />
      </span>
      <select
        className="priority-select__control"
        value={value}
        onChange={(event) => onChange(event.target.value as TaskPriority)}
      >
        {priorities.map((priority) => (
          <option key={priority} value={priority}>
            {priorityMeta[priority].label}
          </option>
        ))}
      </select>
    </div>
  );
}
