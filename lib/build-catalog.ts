import { buildPreviews, scheduledJobs, skills } from "./data";
import type { ScheduledJob, Skill } from "./types";

export type BuildScope =
  | "all"
  | "apps"
  | "websites"
  | "automations"
  | "tasks";

export type TaskCadence = "all" | "recurring" | "once";

export type BuildPreview = (typeof buildPreviews)[number];

export type BuildTask = {
  id: string;
  name: string;
  summary: string;
  cadence: "recurring" | "once";
  schedule?: string;
  nextRun?: string;
  source: Skill["source"] | "schedule";
  updatedAt: string;
  open: { kind: "skill" | "job"; id: string };
};

export function previewKind(item: BuildPreview): "app" | "website" {
  const text = `${item.name} ${item.summary} ${item.projectId}`.toLowerCase();
  if (
    /\b(crm|portal|console|onboarding|operator|dashboard|internal|fleet)\b/.test(
      text,
    )
  ) {
    return "app";
  }
  return "website";
}

export function buildScopeOptions(): { id: BuildScope; label: string }[] {
  return [
    { id: "all", label: "All" },
    { id: "apps", label: "Apps" },
    { id: "websites", label: "Websites" },
    { id: "automations", label: "Automations" },
    { id: "tasks", label: "Tasks" },
  ];
}

export function buildCtaLabel(scope: BuildScope) {
  if (scope === "apps") return "New app";
  if (scope === "websites") return "New website";
  if (scope === "automations") return "New automation";
  if (scope === "tasks") return "New task";
  return "New build";
}

export function filterPreviews(
  items: BuildPreview[],
  scope: BuildScope,
): BuildPreview[] {
  if (scope === "apps") return items.filter((item) => previewKind(item) === "app");
  if (scope === "websites") {
    return items.filter((item) => previewKind(item) === "website");
  }
  if (scope === "automations" || scope === "tasks") return [];
  return items;
}

export function workspaceSkills(workspaceId: string): Skill[] {
  return skills.filter((item) => item.workspaceId === workspaceId);
}

export function workspaceScheduled(workspaceId: string): ScheduledJob[] {
  return scheduledJobs.filter((job) => job.workspaceId === workspaceId);
}

const skillJobIds: Record<string, string> = {
  "sk-seo": "job-seo",
  "sk-a11y": "job-a11y",
};

export function workspaceTasks(workspaceId: string): BuildTask[] {
  const list = workspaceSkills(workspaceId);
  const jobs = workspaceScheduled(workspaceId);
  const usedJobs = new Set<string>();

  const fromSkills: BuildTask[] = list.map((skill) => {
    const match =
      jobs.find((item) => item.id === skillJobIds[skill.id]) ??
      jobs.find(
        (item) => item.name.toLowerCase() === skill.name.toLowerCase(),
      );

    if (match) usedJobs.add(match.id);

    return {
      id: skill.id,
      name: skill.name,
      summary: skill.summary,
      cadence: match ? "recurring" : "once",
      schedule: match?.schedule,
      nextRun: match?.nextRun,
      source: skill.source,
      updatedAt: skill.updatedAt,
      open: { kind: "skill", id: skill.id },
    };
  });

  const fromJobs: BuildTask[] = jobs
    .filter((job) => !usedJobs.has(job.id))
    .map((job) => ({
      id: job.id,
      name: job.name,
      summary: job.snippet,
      cadence: "recurring" as const,
      schedule: job.schedule,
      nextRun: job.nextRun,
      source: "schedule" as const,
      updatedAt: job.lastRun,
      open: { kind: "job" as const, id: job.id },
    }));

  return [...fromSkills, ...fromJobs];
}

/** Recurring workflows attached to builds. */
export function workspaceAutomations(workspaceId: string): BuildTask[] {
  return workspaceTasks(workspaceId).filter(
    (item) => item.cadence === "recurring",
  );
}

/** One-off build tasks. */
export function workspaceOneOffTasks(workspaceId: string): BuildTask[] {
  return workspaceTasks(workspaceId).filter((item) => item.cadence === "once");
}

export function filterTasks(items: BuildTask[], cadence: TaskCadence) {
  if (cadence === "all") return items;
  return items.filter((item) => item.cadence === cadence);
}

export function taskMeta(item: BuildTask) {
  if (item.cadence === "recurring" && item.schedule) {
    return item.nextRun
      ? `${item.schedule} · next ${item.nextRun}`
      : item.schedule;
  }
  return "One-off";
}
