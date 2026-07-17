import { useEffect } from "react";
import { createPortal } from "react-dom";
import "./ConfirmDialog.css";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isLoading) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isLoading, onCancel, open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="confirm-dialog__backdrop" role="presentation" onMouseDown={() => { if (!isLoading) onCancel(); }}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{description}</p>
        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-dialog__danger" disabled={isLoading} onClick={onConfirm}>{confirmLabel}</button>
          <button type="button" disabled={isLoading} onClick={onCancel}>{cancelLabel}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
