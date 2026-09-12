/**
 * Friendly schedule presets ↔ cron + next_run_at helpers.
 */

import type { AgentTrigger } from "@/lib/agents/types";

export type SchedulePreset =
  | "every_1_minute"
  | "every_5_minutes"
  | "every_15_minutes"
  | "every_30_minutes"
  | "hourly"
  | "daily"
  | "custom";

export function cronFromPreset(
  preset: SchedulePreset,
  timeHHmm = "09:00",
): string {
  const [hRaw, mRaw] = timeHHmm.split(":");
  const hour = Math.min(23, Math.max(0, Number(hRaw) || 9));
  const minute = Math.min(59, Math.max(0, Number(mRaw) || 0));
  switch (preset) {
    case "every_1_minute":
      return `* * * * *`;
    case "every_5_minutes":
      return `*/5 * * * *`;
    case "every_15_minutes":
      return `*/15 * * * *`;
    case "every_30_minutes":
      return `*/30 * * * *`;
    case "hourly":
      return `${minute} * * * *`;
    case "daily":
      return `${minute} ${hour} * * *`;
    case "custom":
    default:
      return `${minute} ${hour} * * *`;
  }
}

export function buildScheduleTrigger(opts: {
  preset: SchedulePreset;
  time?: string;
  timezone: string;
  cron?: string;
}): Extract<AgentTrigger, { type: "schedule" }> {
  const time = opts.time ?? "09:00";
  const cron =
    opts.preset === "custom" && opts.cron?.trim()
      ? opts.cron.trim()
      : cronFromPreset(opts.preset, time);
  return {
    type: "schedule",
    preset: opts.preset,
    cron,
    timezone: opts.timezone || "America/Denver",
    time,
  };
}

/** Rough next run from cron — supports common 5-field patterns used by presets. */
export function computeNextRunAt(
  trigger: AgentTrigger,
  from = new Date(),
): Date | null {
  if (trigger.type !== "schedule") return null;
  const parts = trigger.cron.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const [minPart, hourPart, , , dowPart] = parts;
  const candidate = new Date(from.getTime());
  candidate.setSeconds(0, 0);

  for (let i = 0; i < 60 * 24 * 14; i++) {
    candidate.setMinutes(candidate.getMinutes() + 1);
    const minute = candidate.getMinutes();
    const hour = candidate.getHours();
    const dow = candidate.getDay();

    if (!matchCronField(minPart!, minute)) continue;
    if (!matchCronField(hourPart!, hour)) continue;
    if (!matchDow(dowPart!, dow)) continue;
    return candidate;
  }
  return null;
}

function matchCronField(field: string, value: number): boolean {
  if (field === "*") return true;
  if (field.startsWith("*/")) {
    const step = Number(field.slice(2));
    return Number.isFinite(step) && step > 0 && value % step === 0;
  }
  if (field.includes(",")) {
    return field.split(",").some((part) => matchCronField(part.trim(), value));
  }
  if (field.includes("-")) {
    const [a, b] = field.split("-").map(Number);
    return value >= (a ?? 0) && value <= (b ?? 0);
  }
  return Number(field) === value;
}

function matchDow(field: string, dow: number): boolean {
  if (field === "*") return true;
  return matchCronField(field, dow) || (dow === 0 && matchCronField(field, 7));
}

export const SCHEDULE_PRESET_LABELS: Record<SchedulePreset, string> = {
  every_1_minute: "Every minute",
  every_5_minutes: "Every 5 minutes",
  every_15_minutes: "Every 15 minutes",
  every_30_minutes: "Every 30 minutes",
  hourly: "Every hour",
  daily: "Daily",
  custom: "Custom",
};

/** Stable schedule slot key for idempotent cron runs. */
export function scheduleIdempotencyKey(agentId: string, dueAt: string): string {
  const slot = dueAt.replace(/[^0-9T]/g, "").slice(0, 15);
  return `schedule:${agentId}:${slot || "unknown"}`;
}

/** Normalize legacy presets onto the simplified set. */
export function coerceSchedulePreset(raw: unknown): SchedulePreset {
  if (
    raw === "every_1_minute" ||
    raw === "every_5_minutes" ||
    raw === "every_15_minutes" ||
    raw === "every_30_minutes" ||
    raw === "hourly" ||
    raw === "daily" ||
    raw === "custom"
  ) {
    return raw;
  }
  if (raw === "every_few_hours") return "hourly";
  if (raw === "weekday" || raw === "weekly") return "daily";
  return "hourly";
}
