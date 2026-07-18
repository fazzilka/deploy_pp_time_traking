import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { GeneratedAvatar } from "../../components/GeneratedAvatar";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPageHeader,
  AdminRoleBadge,
  AdminStatusBadge,
} from "../../components/AdminUI/AdminUI";
import { useAdminActor } from "../../components/AdminRoute/AdminRoute";
import { getAdminUsers, updateAdminUser } from "../../shared/api/admin";
import type { AdminUserListItem } from "../../shared/types/admin";
import type { UserRole } from "../../shared/types/user";
import { formatDate, formatHumanDuration } from "../../shared/utils/time";
import { useLocale } from "../../i18n";
import "./AdminUsersPage.css";

const PAGE_SIZE = 20;

export function AdminUsersPage() {
  const { locale, t } = useLocale();
  const actor = useAdminActor();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("search") ?? "";
  const role = parseRole(searchParams.get("role"));
  const active = parseActive(searchParams.get("is_active"));
  const offset = parseOffset(searchParams.get("offset"));
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pendingStatusUser, setPendingStatusUser] = useState<AdminUserListItem | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (searchInput === searchQuery) return;
    const timeoutId = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      const trimmed = searchInput.trim();
      if (trimmed) next.set("search", trimmed);
      else next.delete("search");
      next.delete("offset");
      setSearchParams(next);
    }, 400);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput, searchParams, searchQuery, setSearchParams]);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const response = await getAdminUsers({
        search: searchQuery || undefined,
        role: role ?? undefined,
        isActive: active ?? undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setUsers(response.items);
      setTotal(response.total);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [active, offset, role, searchQuery]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(searchQuery || role || active !== null);
  const rangeLabel = useMemo(() => {
    if (!total) return t("admin.users.pagination.empty");
    const first = offset + 1;
    const last = Math.min(offset + users.length, total);
    return t("admin.users.pagination.range", { first, last, total });
  }, [offset, t, total, users.length]);

  function setFilter(key: "role" | "is_active", value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("offset");
    setSearchParams(next);
  }

  function resetFilters() {
    setSearchInput("");
    setSearchParams({});
  }

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    const nextOffset = (nextPage - 1) * PAGE_SIZE;
    if (nextOffset > 0) next.set("offset", String(nextOffset));
    else next.delete("offset");
    setSearchParams(next);
  }

  function openStatusDialog(user: AdminUserListItem) {
    setActionError(null);
    setPendingStatusUser(user);
  }

  async function confirmStatusChange() {
    if (!pendingStatusUser || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    setActionError(null);
    try {
      const updated = await updateAdminUser(pendingStatusUser.id, {
        is_active: !pendingStatusUser.is_active,
      });
      setUsers((current) =>
        current.map((user) =>
          user.id === updated.id
            ? { ...user, is_active: updated.is_active, role: updated.role }
            : user,
        ),
      );
      setSuccessMessage(
        t(updated.is_active ? "admin.users.unblockSuccess" : "admin.users.blockSuccess"),
      );
      setPendingStatusUser(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("admin.errors.updateFailed"));
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  return (
    <main className="admin-page admin-users-page">
      <AdminPageHeader title={t("admin.users.title")} description={t("admin.users.description")} />

      {successMessage && (
        <p className="admin-toast admin-toast--success" role="status">
          {successMessage}
        </p>
      )}

      <section className="admin-users-toolbar" aria-label={t("admin.users.filters.label")}>
        <label className="admin-users-search">
          <span>{t("admin.users.search")}</span>
          <input
            className="text-field"
            type="search"
            value={searchInput}
            placeholder={t("admin.users.searchPlaceholder")}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>
        <label>
          <span>{t("admin.users.filters.role")}</span>
          <select className="select-field" value={role ?? ""} onChange={(event) => setFilter("role", event.target.value)}>
            <option value="">{t("admin.users.filters.allRoles")}</option>
            <option value="user">{t("roles.user")}</option>
            <option value="admin">{t("roles.admin")}</option>
          </select>
        </label>
        <label>
          <span>{t("admin.users.filters.status")}</span>
          <select
            className="select-field"
            value={active === null ? "" : String(active)}
            onChange={(event) => setFilter("is_active", event.target.value)}
          >
            <option value="">{t("admin.users.filters.allStatuses")}</option>
            <option value="true">{t("admin.users.status.active")}</option>
            <option value="false">{t("admin.users.status.inactive")}</option>
          </select>
        </label>
        <button className="button" type="button" disabled={!hasFilters} onClick={resetFilters}>
          {t("admin.users.filters.reset")}
        </button>
      </section>

      {isLoading ? (
        <UsersSkeleton label={t("admin.loading")} />
      ) : loadError ? (
        <AdminErrorState
          message={t("admin.errors.loadFailed")}
          retryLabel={t("admin.actions.retry")}
          onRetry={() => void loadUsers()}
        />
      ) : users.length === 0 ? (
        <AdminEmptyState
          title={t(hasFilters ? "admin.users.noSearchResults" : "admin.users.empty")}
          description={t(hasFilters ? "admin.users.noSearchResultsHint" : "admin.users.emptyHint")}
        />
      ) : (
        <>
          <div className="admin-users-table-shell">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>{t("admin.users.columns.user")}</th>
                  <th>{t("admin.users.columns.email")}</th>
                  <th>{t("admin.users.columns.role")}</th>
                  <th>{t("admin.users.columns.status")}</th>
                  <th>{t("admin.users.columns.tasks")}</th>
                  <th>{t("admin.users.columns.time")}</th>
                  <th>{t("admin.users.columns.createdAt")}</th>
                  <th>{t("admin.users.columns.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <UserTableRow
                    key={user.id}
                    user={user}
                    locale={locale}
                    isSelf={actor.id === user.id}
                    onStatusChange={openStatusDialog}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-users-mobile" role="list">
            {users.map((user) => (
              <UserMobileCard
                key={user.id}
                user={user}
                locale={locale}
                isSelf={actor.id === user.id}
                onStatusChange={openStatusDialog}
              />
            ))}
          </div>
          <nav className="admin-pagination" aria-label={t("admin.users.pagination.label")}>
            <span>{rangeLabel}</span>
            <div>
              <button className="button" type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                {t("admin.users.pagination.previous")}
              </button>
              <span aria-current="page">{t("admin.users.pagination.page", { page, pageCount })}</span>
              <button className="button" type="button" disabled={page >= pageCount} onClick={() => goToPage(page + 1)}>
                {t("admin.users.pagination.next")}
              </button>
            </div>
          </nav>
        </>
      )}

      <ConfirmDialog
        open={pendingStatusUser !== null}
        title={t(pendingStatusUser?.is_active ? "admin.blockDialog.title" : "admin.unblockDialog.title")}
        description={t(
          pendingStatusUser?.is_active
            ? "admin.blockDialog.description"
            : "admin.unblockDialog.description",
          { name: pendingStatusUser ? displayName(pendingStatusUser) : "" },
        )}
        confirmLabel={t(
          isUpdatingStatus
            ? pendingStatusUser?.is_active
              ? "admin.blockDialog.blocking"
              : "admin.unblockDialog.unblocking"
            : pendingStatusUser?.is_active
              ? "admin.blockDialog.confirm"
              : "admin.unblockDialog.confirm",
        )}
        cancelLabel={t("admin.blockDialog.cancel")}
        destructive={pendingStatusUser?.is_active ?? true}
        isLoading={isUpdatingStatus}
        error={actionError}
        onCancel={() => {
          if (!isUpdatingStatus) setPendingStatusUser(null);
        }}
        onConfirm={confirmStatusChange}
      />
    </main>
  );
}

function UserTableRow({
  user,
  locale,
  isSelf,
  onStatusChange,
}: {
  user: AdminUserListItem;
  locale: "ru" | "en";
  isSelf: boolean;
  onStatusChange: (user: AdminUserListItem) => void;
}) {
  const { t } = useLocale();
  return (
    <tr>
      <td>
        <UserIdentity user={user} />
      </td>
      <td><span className="admin-users-table__email">{user.email}</span></td>
      <td><AdminRoleBadge role={user.role} /></td>
      <td><AdminStatusBadge active={user.is_active} /></td>
      <td>{user.stats.tasks_count}</td>
      <td>{formatHumanDuration(user.stats.total_time_seconds, locale)}</td>
      <td>{formatDate(user.created_at, locale)}</td>
      <td>
        <div className="admin-user-actions">
          <Link className="button" to={`/admin/users/${user.id}`}>{t("admin.users.actions.open")}</Link>
          <button
            className={`button${user.is_active ? " button--red" : ""}`}
            type="button"
            disabled={isSelf && user.is_active}
            title={isSelf && user.is_active ? t("admin.errors.selfBlock") : undefined}
            onClick={() => onStatusChange(user)}
          >
            {t(user.is_active ? "admin.userDetails.block" : "admin.userDetails.unblock")}
          </button>
        </div>
      </td>
    </tr>
  );
}

function UserMobileCard(props: Parameters<typeof UserTableRow>[0]) {
  const { user, locale, isSelf, onStatusChange } = props;
  const { t } = useLocale();
  return (
    <article className="admin-user-mobile-card" role="listitem">
      <div className="admin-user-mobile-card__header">
        <UserIdentity user={user} />
        <AdminStatusBadge active={user.is_active} />
      </div>
      <dl>
        <div><dt>{t("admin.users.columns.email")}</dt><dd>{user.email}</dd></div>
        <div><dt>{t("admin.users.columns.role")}</dt><dd><AdminRoleBadge role={user.role} /></dd></div>
        <div><dt>{t("admin.users.columns.tasks")}</dt><dd>{user.stats.tasks_count}</dd></div>
        <div><dt>{t("admin.users.columns.time")}</dt><dd>{formatHumanDuration(user.stats.total_time_seconds, locale)}</dd></div>
      </dl>
      <div className="admin-user-actions">
        <Link className="button" to={`/admin/users/${user.id}`}>{t("admin.users.actions.open")}</Link>
        <button
          className={`button${user.is_active ? " button--red" : ""}`}
          type="button"
          disabled={isSelf && user.is_active}
          onClick={() => onStatusChange(user)}
        >
          {t(user.is_active ? "admin.userDetails.block" : "admin.userDetails.unblock")}
        </button>
      </div>
    </article>
  );
}

function UserIdentity({ user }: { user: AdminUserListItem }) {
  return (
    <div className="admin-user-identity">
      <GeneratedAvatar seed={user.avatar_seed ?? user.email} letter={user.avatar_letter} size={38} title={displayName(user)} />
      <span>
        <strong>{user.full_name || user.username}</strong>
        <small>@{user.username}</small>
      </span>
    </div>
  );
}

function UsersSkeleton({ label }: { label: string }) {
  return (
    <div className="admin-users-skeleton" role="status" aria-label={label}>
      {Array.from({ length: 8 }, (_, index) => <span className="admin-skeleton" key={index} />)}
    </div>
  );
}

function displayName(user: Pick<AdminUserListItem, "full_name" | "username" | "email">) {
  return user.full_name || user.username || user.email;
}

function parseRole(value: string | null): UserRole | null {
  return value === "user" || value === "admin" ? value : null;
}

function parseActive(value: string | null): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function parseOffset(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
