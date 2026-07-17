import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LanguageSwitcher } from "../../components/LanguageSwitcher/LanguageSwitcher";
import { useLocale } from "../../i18n";
import { isAuthenticated } from "../../shared/api/auth";
import {
  acceptInvitation,
  clearInvitationContinuation,
  declineInvitation,
  getInvitationContinuation,
  resolveInvitation,
  saveInvitationContinuation,
} from "../../shared/api/invitations";
import type { InvitationResolve } from "../../shared/types/workspace";
import { invitationErrorKey } from "../../shared/utils/securityErrors";
import "./InvitationPage.css";

export function InvitationPage() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const [invitation, setInvitation] = useState<InvitationResolve | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [action, setAction] = useState<"accept" | "decline" | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const queryToken = new URLSearchParams(window.location.search).get("token");
    if (queryToken) {
      saveInvitationContinuation(queryToken);
      window.history.replaceState({}, "", "/invitations/accept");
    }
    const token = queryToken ?? getInvitationContinuation();
    if (!token) {
      setError(t("invitations.invalid"));
      setIsLoading(false);
      return;
    }
    void resolveInvitation(token)
      .then(setInvitation)
      .catch((caughtError) => setError(t(invitationErrorKey(caughtError))))
      .finally(() => setIsLoading(false));
  }, [t]);

  async function handleDecision(nextAction: "accept" | "decline") {
    if (!invitation || action) return;
    setAction(nextAction);
    setError(null);
    try {
      if (nextAction === "accept") {
        await acceptInvitation(invitation.id);
      } else {
        await declineInvitation(invitation.id);
      }
      clearInvitationContinuation();
      navigate(nextAction === "accept" ? "/team" : "/dashboard", { replace: true });
    } catch (caughtError) {
      setError(t(invitationErrorKey(caughtError)));
      setAction(null);
    }
  }

  const isPending = invitation?.status === "pending";

  return (
    <main className="invitation-page">
      <LanguageSwitcher className="invitation-page__language" />
      <section className="invitation-card" aria-labelledby="invitation-title">
        <div className="invitation-card__brand"><span>TT</span> Time Tracking</div>
        <h1 id="invitation-title">{t("invitations.title")}</h1>
        {isLoading && <p role="status">{t("common.loading")}</p>}
        {!isLoading && invitation && (
          <>
            <p>{t("invitations.description", { inviterName: invitation.invited_by_display_name, workspaceName: invitation.workspace_name })}</p>
            <dl><div><dt>{t("invitations.roleLabel")}</dt><dd>{t(`roles.${invitation.role}`)}</dd></div><div><dt>{t("invitations.emailLabel")}</dt><dd>{invitation.invited_email_masked}</dd></div></dl>
            {!isPending && <p className="invitation-card__status">{t(`invitations.${invitation.status}`)}</p>}
            {isPending && !isAuthenticated() && (
              <button className="invitation-card__primary" type="button" onClick={() => navigate("/auth?mode=register")}>{t("invitations.registerToContinue")}</button>
            )}
            {isPending && isAuthenticated() && (
              <div className="invitation-card__actions">
                <button className="invitation-card__primary" type="button" disabled={Boolean(action)} onClick={() => void handleDecision("accept")}>{t(action === "accept" ? "invitations.accepting" : "invitations.accept")}</button>
                <button type="button" disabled={Boolean(action)} onClick={() => void handleDecision("decline")}>{t(action === "decline" ? "invitations.declining" : "invitations.decline")}</button>
              </div>
            )}
          </>
        )}
        {error && <p className="invitation-card__error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
