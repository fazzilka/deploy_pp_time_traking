import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAdminUsersQuery } from "../shared/api/admin";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const router = read("../app/router.tsx");
const routeGuard = read("../components/AdminRoute/AdminRoute.tsx");
const layout = read("../components/AdminLayout/AdminLayout.tsx");
const layoutStyles = read("../components/AdminLayout/AdminLayout.css");
const navigation = read("../components/Navigation/Navigation.tsx");
const overview = read("./AdminOverviewPage/AdminOverviewPage.tsx");
const users = read("./AdminUsersPage/AdminUsersPage.tsx");
const usersStyles = read("./AdminUsersPage/AdminUsersPage.css");
const details = read("./AdminUserDetailsPage/AdminUserDetailsPage.tsx");
const editor = read("../components/AdminUserEditDialog/AdminUserEditDialog.tsx");
const api = read("../shared/api/admin.ts");
const ru = read("../i18n/locales/ru.ts");
const en = read("../i18n/locales/en.ts");

describe("administration workspace contracts", () => {
  it("shows administration navigation only for administrators", () => {
    expect(navigation).toContain('user?.role === "admin"');
    expect(navigation).toContain('to="/admin/overview"');
    expect(navigation).toContain('<NavigationIcon name="shield" />');
  });

  it("guards admin content before rendering it", () => {
    expect(routeGuard).toContain('Navigate to="/auth"');
    expect(routeGuard).toContain('actor?.role !== "admin"');
    expect(routeGuard).toContain('Navigate to="/dashboard"');
    expect(routeGuard.indexOf("if (isLoading)")).toBeLessThan(
      routeGuard.indexOf("AdminActorContext.Provider"),
    );
    expect(routeGuard).toContain("adminAccessRevokedEvent");
    expect(api).toContain("error.status === 403");
  });

  it("redirects /admin and exposes only real overview and user routes", () => {
    expect(router).toContain('path: "/admin"');
    expect(router).toContain('to="/admin/overview"');
    expect(router).toContain('path: "/admin/users/:userId"');
    expect(router).not.toContain('path: "/admin/email"');
    expect(router).not.toContain('path: "/admin/system"');
  });

  it("provides an accessible responsive administration layout", () => {
    expect(layout).toContain("aria-expanded={isMenuOpen}");
    expect(layout).toContain('event.key === "Escape"');
    expect(layout).toContain('to="/dashboard"');
    expect(layoutStyles).toContain("@media (max-width: 820px)");
    expect(layoutStyles).toContain("transform: translateX(-105%)");
  });

  it("loads real overview metrics with loading, retry, and top users", () => {
    expect(overview).toContain("getAdminStats()");
    expect(overview).toContain("<OverviewSkeleton");
    expect(overview).toContain("<AdminErrorState");
    expect(overview).toContain("stats.top_users.map");
    expect(overview).not.toContain("growth");
  });

  it("serializes supported user API filters and pagination", () => {
    expect(
      buildAdminUsersQuery({
        search: " alex ",
        role: "admin",
        isActive: false,
        limit: 20,
        offset: 40,
      }),
    ).toBe("search=alex&role=admin&is_active=false&limit=20&offset=40");
    expect(api).toContain('method: "PATCH"');
  });

  it("keeps search, filters, and pages in URL parameters with debounce", () => {
    expect(users).toContain("useSearchParams()");
    expect(users).toContain("window.setTimeout");
    expect(users).toContain("}, 400)");
    expect(users).toContain('setFilter("role"');
    expect(users).toContain('next.set("offset"');
  });

  it("renders loading, error, empty, table, and pagination states", () => {
    expect(users).toContain("<UsersSkeleton");
    expect(users).toContain("<AdminErrorState");
    expect(users).toContain("<AdminEmptyState");
    expect(users).toContain('<table className="admin-users-table">');
    expect(users).toContain('aria-label={t("admin.users.pagination.label")');
  });

  it("uses responsive cards and protects long user values", () => {
    expect(users).toContain('<div className="admin-users-mobile" role="list">');
    expect(usersStyles).toContain("@media (max-width: 760px)");
    expect(usersStyles).toContain("overflow-wrap: anywhere");
    expect(usersStyles).toContain(".admin-users-table-shell { display: none; }");
  });

  it("loads user details and activity from typed admin APIs", () => {
    expect(details).toContain("getAdminUser(userId)");
    expect(details).toContain("getAdminUserActivity(userId, activityYear)");
    expect(details).toContain("<ActivityGrid");
    expect(details).toContain("user.email_verified");
  });

  it("validates and protects the edit dialog", () => {
    expect(editor).toContain("FOCUSABLE_SELECTOR");
    expect(editor).toContain('event.key === "Escape"');
    expect(editor).toContain("if (isSaving) return");
    expect(editor).toContain("username.trim()");
    expect(editor).toContain("confirmSelfDemotion");
  });

  it("uses the shared confirmation dialog without browser confirm", () => {
    const browserConfirm = ["window", "confirm"].join(".");
    expect(users).toContain("<ConfirmDialog");
    expect(details).toContain("<ConfirmDialog");
    expect(users).not.toContain(browserConfirm);
    expect(details).not.toContain(browserConfirm);
    expect(editor).not.toContain(browserConfirm);
  });

  it("ships the administration interface in both locales", () => {
    for (const source of [ru, en]) {
      expect(source).toContain('"navigation.administration"');
      expect(source).toContain('"admin.overview.title"');
      expect(source).toContain('"admin.users.columns.actions"');
      expect(source).toContain('"admin.errors.lastAdmin"');
    }
  });
});
