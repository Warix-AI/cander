/**
 * Display helpers for AI minutes.
 * Backend keeps ms precision; UI rounds the aggregate, never per-event.
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

export function formatMinutesDetail(opts: {
  usedMinutes: number;
  includedMinutes: number;
}): string {
  const used = formatUsedMinutes(opts.usedMinutes);
  const included = Math.round(opts.includedMinutes);
  return `${used} / ${included} minutes`;
}

export function formatMinutesRemainingLine(remainingMinutes: number): string {
  const remaining = formatRemainingMinutes(remainingMinutes);
  if (remaining === "0") return "No minutes remaining";
  if (remaining === "<1") return "Less than 1 minute remaining";
  return `${remaining} minutes remaining`;
}

export function microsToUsd(micros: number | null | undefined): number | null {
  if (micros == null || !Number.isFinite(micros)) return null;
  return micros / 1_000_000;
}
