/**
 * One-shot empty-composer suggestion after onboarding, based on connected Apps.
 */

const KEY = "cander-onboarding-composer-hint";

export function setOnboardingComposerHint(hint: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, hint);
  } catch {
    // ignore
  }
}

export function consumeOnboardingComposerHint(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

/** Build a lightweight suggestion from connected connector ids. */
export function composerHintForConnectedApps(connectorIds: string[]): string {
  const set = new Set(connectorIds);
  const hasGmail = set.has("gmail");
  const hasCal = set.has("gcal");
  if (hasGmail && hasCal) {
    return "Catch me up on today and show me what’s next.";
  }
  if (hasGmail) {
    return "Ask Cander what you missed today.";
  }
  if (hasCal) {
    return "What’s on my calendar today?";
  }
  if (set.has("slack")) {
    return "Catch me up on Slack.";
  }
  if (connectorIds.length === 0) {
    return "Ask Cander anything, or connect an App whenever you’re ready.";
  }
  return "Ask Cander anything about your connected Apps.";
}
