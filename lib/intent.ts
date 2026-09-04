import { connectors, scheduledJobs } from "./data";
import {
  defaultProjectForSpace,
  projectsForWorkspace,
} from "./project-resolver";
import { isChatSpace } from "./spaces";
import type { BuildTool, NavDestinationId, SpaceId } from "./types";

export type Intent = {
  space: NavDestinationId;
  projectId?: string;
  buildTool?: BuildTool;
  connectorId?: string;
  jobId?: string;
  reply: string;
  /** False when the message did not match a specific space category. */
  resolved: boolean;
};

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

const handoffLead: Partial<Record<SpaceId, string>> = {
  work: "I’ll use Work for this.",
  build: "I’ll use Build to make this.",
  research: "I'll use Home to look into this.",
};

function withHandoff(
  intent: Intent,
  current: NavDestinationId | null | undefined,
): Intent {
  if (
    !current ||
    !isChatSpace(current) ||
    current === intent.space ||
    !isChatSpace(intent.space)
  ) {
    return intent;
  }
  const lead = handoffLead[intent.space];
  if (!lead) return intent;
  return { ...intent, reply: `${lead} ${intent.reply}` };
}

export function inferIntent(
  raw: string,
  workspaceId: string,
  currentSpace?: NavDestinationId | null,
): Intent {
  const text = raw.toLowerCase();
  const workspaceProjects = projectsForWorkspace(workspaceId);
  const mentioned = workspaceProjects.find((project) =>
    text.includes(project.name.toLowerCase()),
  );
  const connecting = includesAny(text, [
    "connect",
    "connector",
    "connectors",
    "install",
  ]);

  const finish = (intent: Omit<Intent, "resolved">): Intent =>
    withHandoff({ ...intent, resolved: true }, currentSpace);

  if (includesAny(text, ["handshake", "ai readiness", "ai-ready"])) {
    return finish({
      space: "connectors",
      connectorId: "handshake",
      reply:
        "Opening Handshake — your trust layer for AI agents and businesses.",
    });
  }

  if (
    connecting &&
    includesAny(text, [
      "stripe",
      "gmail",
      "github",
      "slack",
      "calendar",
      "hubspot",
      "notion",
      "linear",
      "figma",
    ])
  ) {
    const connector =
      connectors.find((item) => text.includes(item.name.toLowerCase())) ??
      connectors.find((item) => item.id === "stripe") ??
      connectors[0];
    return finish({
      space: "connectors",
      connectorId: connector.id,
      projectId: mentioned?.id,
      reply: `Connectors is on the right — ${connector.name} accounts, permissions, and actions.`,
    });
  }

  if (includesAny(text, ["connector", "connectors"]) && connecting) {
    const connector =
      connectors.find((item) => text.includes(item.name.toLowerCase())) ??
      connectors[0];
    return finish({
      space: "connectors",
      connectorId: connector.id,
      reply: `Connectors is on the right${connector ? ` — ${connector.name}` : ""}.`,
    });
  }

  if (
    includesAny(text, [
      "file library",
      "files library",
      "open files",
      "my files",
    ]) ||
    (includesAny(text, ["files"]) &&
      includesAny(text, ["library", "upload", "uploads"]))
  ) {
    return finish({
      space: "build",
      reply: "Those files live in Build — projects, assets, and uploads in one library.",
    });
  }

  const workAsk =
    includesAny(text, [
      "email",
      "meeting",
      "follow up",
      "follow-up",
      "calendar",
      "inbox",
      "reply",
      "respond",
      "approve",
      "approval",
    ]) ||
    (includesAny(text, ["work"]) && !includesAny(text, ["network", "framework"]));

  if (workAsk) {
    return finish({
      space: "work",
      projectId: mentioned?.id,
      reply: mentioned
        ? `Work is open on ${mentioned.name}.`
        : "Work is open — inbox, meetings, and follow-ups.",
    });
  }

  const buildAsk =
    includesAny(text, [
      "build",
      "website",
      "app",
      "landing",
      "page",
      "component",
      "deploy",
      "publish",
      "preview",
      "code",
      "repo",
      "crm",
      "portal",
      "dashboard",
    ]) ||
    includesAny(text, ["make me", "create a", "build me"]);

  if (buildAsk) {
    const projectId =
      mentioned?.id ?? defaultProjectForSpace(workspaceId, "build")?.id;
    return finish({
      space: "build",
      projectId,
      buildTool: "preview",
      reply: mentioned
        ? `Build is open on ${mentioned.name}. Preview is on the right.`
        : "Build is open. Preview will appear as soon as there’s something to show.",
    });
  }

  const researchAsk =
    includesAny(text, [
      "research",
      "explore",
      "competitor",
      "competitors",
      "market",
      "landscape",
      "summarize",
      "sources",
      "report",
    ]) || includesAny(text, ["look into", "find out"]);

  if (researchAsk) {
    const projectId =
      mentioned?.id ?? defaultProjectForSpace(workspaceId, "research")?.id;
    return finish({
      space: "research",
      projectId,
      reply: mentioned
        ? `Home is open on ${mentioned.name}.`
        : "Home is open — sources, notes, and reports.",
    });
  }

  const scheduled = scheduledJobs.find((job) =>
    text.includes(job.name.toLowerCase()),
  );
  if (scheduled) {
    return finish({
      space: "build",
      jobId: scheduled.id,
      projectId: scheduled.projectId,
      reply: `Scheduled job “${scheduled.name}” is in Build.`,
    });
  }

  return {
    space: "work",
    reply: "How can I help?",
    resolved: false,
  };
}

export function nextId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function labelFor(space: SpaceId) {
  if (space === "home" || space === "research") return "Explore";
  if (space === "work") return "Work";
  if (space === "studio" || space === "build") return "Create";
  return "Create";
}
