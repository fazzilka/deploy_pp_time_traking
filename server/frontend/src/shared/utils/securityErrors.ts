import type { TranslationKey } from "../../i18n/locales/ru";

function message(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : "";
}

export function verificationErrorKey(error: unknown): TranslationKey {
  const value = message(error);
  if (value.includes("истёк") || value.includes("expired")) return "auth.verifyEmail.expired";
  if (value.includes("число попыток") || value.includes("too many attempts")) return "auth.verifyEmail.tooManyAttempts";
  if (value.includes("повторная отправка") || value.includes("resend")) return "auth.verifyEmail.resendUnavailable";
  if (value.includes("уже завершена") || value.includes("already completed")) return "auth.verifyEmail.completed";
  return "auth.verifyEmail.invalidCode";
}

export function invitationErrorKey(error: unknown): TranslationKey {
  const value = message(error);
  if (value.includes("другого аккаунта") || value.includes("another account")) return "invitations.wrongAccount";
  if (value.includes("истек") || value.includes("expired")) return "invitations.expired";
  if (value.includes("уже состоит") || value.includes("already a team")) return "invitations.alreadyMember";
  if (value.includes("уже существует") || value.includes("already exists")) return "invitations.alreadyPending";
  if (value.includes("обработано") || value.includes("processed")) return "invitations.processed";
  if (value.includes("не найдено") || value.includes("not found")) return "invitations.invalid";
  return "common.errors.generic";
}
