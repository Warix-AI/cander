/**
 * Display helpers for AI usage.
 * Backend meters Active AI Minutes; customer UI prefers percentage remaining.
 */

export function formatUsedMinutes(usedMinutes: number): string {
  if (usedMinutes <= 0) return "0";
  if (usedMinutes < 1) return "<1";
  return String(Math.round(usedMinutes));
}

export function formatRemainingMinutes(remainingMinutes: number): string {
  if (remainingMinutes <= 0) return "0";
  if (remainingMinutes < 1) return "<1";
  return String(Math.round(remainingMinutes));
}

/** Customer-facing usage line — percent remaining, not minute counts. */
export function formatUsagePercentRemaining(percentUsed: number): string {
  const used = Math.max(0, Math.min(100, Math.round(percentUsed)));
  const remaining = Math.max(0, 100 - used);
  if (remaining <= 0) return "0% remaining";
  return `${remaining}% remaining`;
}

/**
 * @deprecated Prefer formatUsagePercentRemaining for customer UI.
 * Kept for admin / diagnostics that still show minute counts.
 */
export function formatMinutesDetail(opts: {
  usedMinutes: number;
  includedMinutes: number;
}): string {
  const used = formatUsedMinutes(opts.usedMinutes);
  const included = Math.round(opts.includedMinutes);
  return `${used} / ${included}`;
}

/** @deprecated Prefer formatUsagePercentRemaining. */
export function formatMinutesRemainingLine(remainingMinutes: number): string {
  const remaining = formatRemainingMinutes(remainingMinutes);
  if (remaining === "0") return "No usage remaining";
  if (remaining === "<1") return "Almost out of usage";
  return `${remaining} remaining`;
}

export function microsToUsd(micros: number | null | undefined): number | null {
  if (micros == null || !Number.isFinite(micros)) return null;
  return micros / 1_000_000;
}
