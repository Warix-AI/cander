import type { UsageFeatureCategory, UsageWindowKind } from "./types.ts";

export function windowStart(kind: UsageWindowKind, now = new Date()): Date {
  const d = new Date(now);
  switch (kind) {
    case "minute":
      d.setUTCSeconds(0, 0);
      return d;
    case "hour":
      d.setUTCMinutes(0, 0, 0);
      return d;
    case "day":
      d.setUTCHours(0, 0, 0, 0);
      return d;
    case "month":
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    default:
      return d;
  }
}

export function windowStartIso(kind: UsageWindowKind, now = new Date()): string {
  return windowStart(kind, now).toISOString();
}

export function retryAfterSeconds(kind: UsageWindowKind, now = new Date()): number {
  const start = windowStart(kind, now).getTime();
  const next = {
    minute: start + 60_000,
    hour: start + 3_600_000,
    day: start + 86_400_000,
    month: (() => {
      const d = new Date(start);
      d.setUTCMonth(d.getUTCMonth() + 1);
      return d.getTime();
    })(),
  }[kind];
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export function estimateCostMicros(
  units: number,
  costWeightMicrosPerUnit: number,
): number {
  if (!Number.isFinite(units) || units <= 0) return 0;
  return Math.max(0, Math.round(units * costWeightMicrosPerUnit));
}

export function counterKey(
  workspaceId: string,
  profileId: string | null,
  feature: UsageFeatureCategory,
  kind: UsageWindowKind,
  startIso: string,
): string {
  return `${workspaceId}|${profileId ?? ""}|${feature}|${kind}|${startIso}`;
}

export function reservationKey(workspaceId: string, idempotencyKey: string): string {
  return `${workspaceId}|${idempotencyKey}`;
}
