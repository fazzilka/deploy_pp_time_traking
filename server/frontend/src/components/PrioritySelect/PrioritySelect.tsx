import { useEffect, useRef, useState } from "react";
import { PriorityIcon } from "../PriorityIcon/PriorityIcon";
import type { TaskPriority } from "../../shared/types/task";
import { useLocale } from "../../i18n";
import "./PrioritySelect.css";

type PrioritySelectProps = {
  value: TaskPriority;
  onChange: (value: TaskPriority) => void;
};

const priorities: TaskPriority[] = ["highest", "high", "medium", "low", "lowest"];

export function PrioritySelect({ value, onChange }: PrioritySelectProps) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleDocumentClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [isOpen]);

  function handleSelect(priority: TaskPriority) {
    onChange(priority);
    setIsOpen(false);
  }

  return (
    <div className="priority-select" ref={rootRef}>
      <button
        className="priority-select__button"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
      >
        <span className="priority-select__value">
          <PriorityIcon priority={value} />
          <span className="priority-select__label">{t(`tasks.priority.${value}`)}</span>
        </span>
        <span className="priority-select__chevron" aria-hidden="true">
          v
        </span>
      </button>

      {isOpen && (
        <div className="priority-select__menu" role="listbox">
          {priorities.map((priority) => (
            <button
              key={priority}
              className={`priority-select__option${priority === value ? " priority-select__option--active" : ""}`}
              type="button"
              role="option"
              aria-selected={priority === value}
              onClick={() => handleSelect(priority)}
            >
              <PriorityIcon priority={priority} />
              <span>{t(`tasks.priority.${priority}`)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
