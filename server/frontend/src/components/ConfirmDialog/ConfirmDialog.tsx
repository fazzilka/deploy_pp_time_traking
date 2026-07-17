import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ConfirmDialog.css";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  detail?: string;
  confirmLabel: string;
  cancelLabel: string;
  isLoading?: boolean;
  destructive?: boolean;
  error?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  detail,
  confirmLabel,
  cancelLabel,
  isLoading = false,
  destructive = true,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const [isConfirming, setIsConfirming] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const isBusy = isLoading || isConfirming;
  const isBusyRef = useRef(isBusy);

  useEffect(() => {
    onCancelRef.current = onCancel;
    isBusyRef.current = isBusy;
  }, [isBusy, onCancel]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusDialog = window.setTimeout(() => cancelButtonRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!isBusyRef.current) {
          event.preventDefault();
          onCancelRef.current();
        }
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusDialog);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) setIsConfirming(false);
  }, [open]);

  async function handleConfirm() {
    if (isBusy) return;
    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      setIsConfirming(false);
    }
  }

  function handleOverlayMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !isBusy) onCancel();
  }

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="confirm-dialog__backdrop" role="presentation" onMouseDown={handleOverlayMouseDown}>
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
        tabIndex={-1}
      >
        <div className="confirm-dialog__content">
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
          {detail ? <p className="confirm-dialog__detail">{detail}</p> : null}
          {error ? <p className="confirm-dialog__error" id={errorId} role="alert">{error}</p> : null}
        </div>
        <footer className="confirm-dialog__actions">
          <button ref={cancelButtonRef} type="button" className="button" disabled={isBusy} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={destructive ? "button button--red" : "button button--green"} disabled={isBusy} onClick={() => void handleConfirm()}>{confirmLabel}</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
