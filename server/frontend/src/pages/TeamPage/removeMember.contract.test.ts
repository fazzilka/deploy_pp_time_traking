import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const teamSource = readFileSync(new URL("./TeamPage.tsx", import.meta.url), "utf8");
const dialogSource = readFileSync(
  new URL("../../components/ConfirmDialog/ConfirmDialog.tsx", import.meta.url),
  "utf8",
);
const dialogStyles = readFileSync(
  new URL("../../components/ConfirmDialog/ConfirmDialog.css", import.meta.url),
  "utf8",
);
const ru = readFileSync(new URL("../../i18n/locales/ru.ts", import.meta.url), "utf8");
const en = readFileSync(new URL("../../i18n/locales/en.ts", import.meta.url), "utf8");

describe("workspace member removal dialog contracts", () => {
  it("stages removal in the custom dialog before making the API request", () => {
    const openBlock = teamSource.slice(
      teamSource.indexOf("function handleRemoveMember"),
      teamSource.indexOf("function closeRemoveMemberDialog"),
    );

    expect(openBlock).toContain("setMemberToRemove(member)");
    expect(openBlock).not.toContain("removeWorkspaceMember");
    expect(teamSource).toContain("await removeWorkspaceMember(currentWorkspaceId, memberToRemove.id)");
    expect(teamSource).toContain("if (!currentWorkspaceId || !memberToRemove || isRemovingMember)");
  });

  it("keeps the dialog open after an error and removes the member only after success", () => {
    const confirmStart = teamSource.indexOf("async function confirmRemoveMember");
    const confirmBlock = teamSource.slice(confirmStart, teamSource.indexOf("return (", confirmStart));

    expect(confirmBlock).toContain("setRemoveMemberError(t(\"workspaceMembers.removeDialog.error\"))");
    expect(confirmBlock).toContain("setMembers((currentMembers) => currentMembers.filter");
    expect(confirmBlock).toContain("setMemberToRemove(null);");
    expect(confirmBlock.indexOf("setMemberToRemove(null);")).toBeLessThan(
      confirmBlock.indexOf("} catch {"),
    );
  });

  it("does not expose removal for protected workspaces, owners, or non-owner actors", () => {
    expect(teamSource).toContain('const canRemoveMembers = currentUserRole === "owner" && !currentWorkspace?.is_protected;');
    expect(teamSource).toContain('member.role !== "owner"');
    expect(teamSource).toContain("{canRemoveMember(openMemberMenu.member) ? (");
  });

  it("uses localized member and workspace text instead of browser confirmation", () => {
    expect(teamSource).toContain('t("workspaceMembers.removeDialog.description"');
    expect(teamSource).toContain('t("workspaceMembers.removeDialog.success"');
    expect(teamSource).not.toMatch(/\bwindow\.confirm\s*\(|\bconfirm\s*\(/);
    expect(ru).toContain("Пользователь {{memberName}} будет удалён из команды „{{workspaceName}}“.");
    expect(en).toContain("{{memberName}} will be removed from “{{workspaceName}}”.");
  });

  it("provides focus handling, accessible labels, loading state, and responsive long-text layout", () => {
    expect(dialogSource).toContain("aria-labelledby={titleId}");
    expect(dialogSource).toContain("aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}");
    expect(dialogSource).toContain("event.key !== \"Tab\"");
    expect(dialogSource).toContain("previousFocusRef.current?.focus()");
    expect(dialogSource).toContain("disabled={isBusy}");
    expect(dialogStyles).toContain("overflow-wrap: anywhere");
    expect(dialogStyles).toContain("@media (max-width: 480px)");
  });
});
