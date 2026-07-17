import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authSource = readFileSync(new URL("./AuthPage/AuthPage.tsx", import.meta.url), "utf8");
const invitationSource = readFileSync(new URL("./InvitationPage/InvitationPage.tsx", import.meta.url), "utf8");
const notificationSource = readFileSync(
  new URL("../components/NotificationsBell/NotificationsBell.tsx", import.meta.url),
  "utf8",
);
const teamSource = readFileSync(new URL("./TeamPage/TeamPage.tsx", import.meta.url), "utf8");
const projectSource = readFileSync(
  new URL("./ProjectDetailPage/ProjectDetailPage.tsx", import.meta.url),
  "utf8",
);
const taskDetailsSource = readFileSync(
  new URL("../components/TaskDetailsModal/TaskDetailsModal.tsx", import.meta.url),
  "utf8",
);

describe("registration and invitation flow contracts", () => {
  it("does not authenticate after registration start and authenticates only after verify", () => {
    const startBlock = authSource.slice(
      authSource.indexOf("const response = await startRegistration"),
      authSource.indexOf("async function handleVerificationSubmit"),
    );
    expect(startBlock).not.toContain("saveAccessToken");
    expect(authSource).toContain("await verifyRegistration");
    expect(authSource).toContain("saveAccessToken(response.access_token)");
  });

  it("keeps invitation continuation through registration and removes token from the URL", () => {
    expect(invitationSource).toContain("saveInvitationContinuation(queryToken)");
    expect(invitationSource).toContain('replaceState({}, "", "/invitations/accept")');
    expect(authSource).toContain("getInvitationContinuation()");
    expect(invitationSource).toContain("clearInvitationContinuation()");
  });

  it("blocks repeated notification decisions and never uses browser confirm", () => {
    expect(notificationSource).toContain("if (!invitationId || invitationAction) return");
    expect(notificationSource).not.toMatch(/\b(confirm|alert|prompt)\s*\(/);
    expect(invitationSource).not.toMatch(/\b(confirm|alert|prompt)\s*\(/);
    expect(teamSource).not.toMatch(/\b(confirm|alert|prompt)\s*\(/);
    expect(projectSource).not.toMatch(/\b(confirm|alert|prompt)\s*\(/);
    expect(taskDetailsSource).not.toMatch(/\b(confirm|alert|prompt)\s*\(/);
  });
});
