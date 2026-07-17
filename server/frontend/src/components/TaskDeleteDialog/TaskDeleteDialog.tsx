import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../../i18n";
import "./TaskDeleteDialog.css";

type TaskDeleteDialogProps = {
  open: boolean;
  taskName: string;
  isDeleting: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export function TaskDeleteDialog({
  open,
  taskName,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: TaskDeleteDialogProps) {
  const { t } = useLocale();
  const dialogRef = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasFocusedRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const [isConfirming, setIsConfirming] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const isBusy = isDeleting || isConfirming;
  const isBusyRef = useRef(isBusy);

  useEffect(() => {
    onCancelRef.current = onCancel;
    isBusyRef.current = isBusy;
  }, [isBusy, onCancel]);

  useEffect(() => {
    if (!open) {
      return;
    }

    wasFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusDialog = window.setTimeout(() => cancelButtonRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!isBusyRef.current) {
          event.preventDefault();
          onCancelRef.current();
        }
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusDialog);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      wasFocusedRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setIsConfirming(false);
    }
  }, [open]);

  async function handleConfirm() {
    if (isBusy) {
      return;
    }

    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      setIsConfirming(false);
    }
  }

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !isBusy) {
      onCancel();
    }
  }

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="task-delete-dialog-backdrop" role="presentation" onMouseDown={handleOverlayClick}>
      <section
        ref={dialogRef}
        className="task-delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
        tabIndex={-1}
      >
        <div className="task-delete-dialog__content">
          <h2 id={titleId}>{t("tasks.deleteDialog.title")}</h2>
          <p id={descriptionId}>{t("tasks.deleteDialog.description")}</p>
          <p className="task-delete-dialog__task-name">{t("tasks.deleteDialog.taskName", { taskName })}</p>
          {error ? (
            <p className="task-delete-dialog__error" id={errorId} role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="task-delete-dialog__actions">
          <button ref={cancelButtonRef} className="button" type="button" onClick={onCancel} disabled={isBusy}>
            {t("common.actions.cancel")}
          </button>
          <button className="button button--red" type="button" onClick={() => void handleConfirm()} disabled={isBusy}>
            {t(isBusy ? "tasks.deleteDialog.deleting" : "common.actions.delete")}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
