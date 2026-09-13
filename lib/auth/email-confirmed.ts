import type { User } from "@supabase/supabase-js";

const PENDING_EMAIL_KEY = "cander-pending-signup-email";

/** True when Auth has confirmed the email (OTP or link). */
export function isAuthEmailConfirmed(user: User | null | undefined): boolean {
  if (!user?.email) return false;
  return Boolean(user.email_confirmed_at);
}

export function persistPendingSignupEmail(email: string) {
  if (typeof window === "undefined") return;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@")) return;
  try {
    window.sessionStorage.setItem(PENDING_EMAIL_KEY, trimmed);
  } catch {
    // ignore
  }
}

export function readPendingSignupEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(PENDING_EMAIL_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function clearPendingSignupEmail() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    // ignore
  }
}
