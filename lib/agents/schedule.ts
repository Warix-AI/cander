/**
 * Friendly schedule presets ↔ cron + next_run_at helpers.
 */

import type { AgentTrigger } from "@/lib/agents/types";

export type SchedulePreset =
  | "hourly"
  | "daily"
  | "weekday"
  | "weekly"
  | "custom";

export function cronFromPreset(
  preset: SchedulePreset,
  timeHHmm = "09:00",
): string {
  const [hRaw, mRaw] = timeHHmm.split(":");
  const hour = Math.min(23, Math.max(0, Number(hRaw) || 9));
  const minute = Math.min(59, Math.max(0, Number(mRaw) || 0));
  switch (preset) {
    case "hourly":
      return `${minute} * * * *`;
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekday":
      return `${minute} ${hour} * * 1-5`;
    case "weekly":
      return `${minute} ${hour} * * 1`;
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
    const dow = candidate.getDay(); // 0=Sun

    if (!matchCronField(minPart!, minute)) continue;
    if (!matchCronField(hourPart!, hour)) continue;
    if (!matchDow(dowPart!, dow)) continue;
    return candidate;
  }
  return null;
}

function matchCronField(field: string, value: number): boolean {
  if (field === "*") return true;
  if (field.includes("/")) {
    const [base, stepRaw] = field.split("/");
    const step = Number(stepRaw) || 1;
    if (base === "*") return value % step === 0;
  }
  if (field.includes("-")) {
    const [a, b] = field.split("-").map(Number);
    return value >= (a ?? 0) && value <= (b ?? 0);
  }
  if (field.includes(",")) {
    return field.split(",").map(Number).includes(value);
  }
  return Number(field) === value;
}

function matchDow(field: string, dow: number): boolean {
  if (field === "*") return true;
  // cron: 0/7 = Sunday, 1-5 = Mon-Fri
  const normalized = field.replace(/7/g, "0");
  if (normalized.includes("-")) {
    const [a, b] = normalized.split("-").map(Number);
    if (a! <= b!) return dow >= a! && dow <= b!;
    return dow >= a! || dow <= b!;
  }
  if (normalized.includes(",")) {
    return normalized.split(",").map(Number).includes(dow);
  }
  return Number(normalized) === dow;
}
