import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "../ConfirmDialog/ConfirmDialog";
import { updateAdminUser } from "../../shared/api/admin";
import { ApiError } from "../../shared/api/client";
import type { AdminUserDetails } from "../../shared/types/admin";
import type { UserProfile, UserRole } from "../../shared/types/user";
import { useLocale } from "../../i18n";
import "./AdminUserEditDialog.css";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export function AdminUserEditDialog({
  open,
  user,
  actor,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: AdminUserDetails;
  actor: UserProfile;
  onClose: () => void;
  onSaved: (user: AdminUserDetails) => void;
}) {
  const { t } = useLocale();
  const dialogRef = useRef<HTMLElement | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [username, setUsername] = useState(user.username);
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [role, setRole] = useState<UserRole>(user.role);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmSelfDemotion, setConfirmSelfDemotion] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsername(user.username);
    setFullName(user.full_name ?? "");
    setRole(user.role);
    setError(null);
    setConfirmSelfDemotion(false);
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusId = window.setTimeout(() => usernameRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (confirmSelfDemotion) return;
      if (event.key === "Escape" && !isSaving) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusId);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [confirmSelfDemotion, isSaving, onClose, open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!username.trim()) {
      setError(t("admin.edit.usernameRequired"));
      usernameRef.current?.focus();
      return;
    }
    if (actor.id === user.id && user.role === "admin" && role !== "admin") {
      setConfirmSelfDemotion(true);
      return;
    }
    void save();
  }

  async function save() {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateAdminUser(user.id, {
        username: username.trim(),
        full_name: fullName.trim() || null,
        role,
      });
      onSaved(updated);
    } catch (caughtError) {
      setError(
        resolveAdminError(caughtError, {
          fallback: t("admin.errors.updateFailed"),
          lastAdmin: t("admin.errors.lastAdmin"),
          duplicateUsername: t("admin.errors.duplicateUsername"),
          userNotFound: t("admin.errors.userNotFound"),
        }),
      );
    } finally {
      setIsSaving(false);
      setConfirmSelfDemotion(false);
    }
  }

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div
        className="admin-edit-dialog__backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isSaving) onClose();
        }}
      >
        <section
          className="admin-edit-dialog"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
        >
          <header>
            <div>
              <h2 id={titleId}>{t("admin.edit.title")}</h2>
              <p id={descriptionId}>{t("admin.edit.description")}</p>
            </div>
            <button type="button" aria-label={t("admin.edit.close")} disabled={isSaving} onClick={onClose}>×</button>
          </header>
          <form onSubmit={handleSubmit}>
            <label>
              <span>{t("admin.edit.username")}</span>
              <input
                ref={usernameRef}
                className="text-field"
                value={username}
                required
                minLength={1}
                maxLength={64}
                autoComplete="off"
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label>
              <span>{t("admin.edit.fullName")}</span>
              <input
                className="text-field"
                value={fullName}
                maxLength={255}
                autoComplete="off"
                onChange={(event) => setFullName(event.target.value)}
              />
            </label>
            <label>
              <span>{t("admin.edit.role")}</span>
              <select className="select-field" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                <option value="user">{t("roles.user")}</option>
                <option value="admin">{t("roles.admin")}</option>
              </select>
            </label>
            {error && <p className="admin-edit-dialog__error" role="alert">{error}</p>}
            <footer>
              <button className="button" type="button" disabled={isSaving} onClick={onClose}>{t("admin.edit.cancel")}</button>
              <button className="button button--green" type="submit" disabled={isSaving}>
                {t(isSaving ? "admin.edit.saving" : "admin.edit.save")}
              </button>
            </footer>
          </form>
        </section>
      </div>
      <ConfirmDialog
        open={confirmSelfDemotion}
        title={t("admin.edit.selfDemotionTitle")}
        description={t("admin.edit.selfDemotionDescription")}
        confirmLabel={t("admin.edit.selfDemotionConfirm")}
        cancelLabel={t("admin.edit.cancel")}
        isLoading={isSaving}
        destructive
        onCancel={() => setConfirmSelfDemotion(false)}
        onConfirm={save}
      />
    </>,
    document.body,
  );
}

function resolveAdminError(
  error: unknown,
  messages: {
    fallback: string;
    lastAdmin: string;
    duplicateUsername: string;
    userNotFound: string;
  },
): string {
  if (error instanceof ApiError && error.code === "last_active_admin") return messages.lastAdmin;
  if (error instanceof ApiError && error.code === "duplicate_username") {
    return messages.duplicateUsername;
  }
  if (error instanceof ApiError && error.code === "user_not_found") return messages.userNotFound;
  return error instanceof Error ? error.message : messages.fallback;
}
