import { connectors, projects, scheduledJobs } from "./data";
import { isChatSpace } from "./spaces";
import type { BuildTool, SpaceId } from "./types";

export type Intent = {
  space: SpaceId;
  projectId?: string;
  buildTool?: BuildTool;
  connectorId?: string;
  jobId?: string;
  reply: string;
};

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

const spaceNames: Record<string, string> = {
  work: "Work",
  build: "Build",
  studio: "Studio",
  research: "Research",
  personal: "Personal",
};

const handoffLead: Partial<Record<SpaceId, string>> = {
  work: "I’ll use Work for this.",
  build: "I’ll use Build to make this.",
  studio: "I’ll use Studio to turn this into a presentation.",
  research: "I’ll use Research to look into this.",
  personal: "I’ll use Personal for this.",
};

function withHandoff(
  intent: Intent,
  current: SpaceId | null | undefined,
): Intent {
  if (
    !current ||
    !isChatSpace(current) ||
    current === intent.space ||
    !isChatSpace(intent.space)
  ) {
    return intent;
  }
  const lead =
    intent.space === "studio" && includesAny(intent.reply.toLowerCase(), ["presentation", "deck"])
      ? handoffLead.studio
      : intent.space === "studio"
        ? "I’ll use Studio for this."
        : handoffLead[intent.space];
  if (!lead) return intent;
  return { ...intent, reply: `${lead} ${intent.reply}` };
}

export function inferIntent(
  raw: string,
  workspaceId: string,
  currentSpace?: SpaceId | null,
): Intent {
  const text = raw.toLowerCase();
  const mentioned = projects.find((project) =>
    text.includes(project.name.toLowerCase()),
  );
  const connecting = includesAny(text, [
    "connect",
    "connector",
    "connectors",
    "install",
  ]);

  const finish = (intent: Intent) => withHandoff(intent, currentSpace);

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
    return {
      space: "connectors",
      connectorId: connector.id,
      projectId: mentioned?.id,
      reply: `Connectors is on the right — ${connector.name} accounts, permissions, and actions.`,
    };
  }

  if (includesAny(text, ["connector", "connectors"]) && connecting) {
    const connector =
      connectors.find((item) => text.includes(item.name.toLowerCase())) ??
      connectors[0];
    return {
      space: "connectors",
      connectorId: connector.id,
      reply: `Connectors is on the right${connector ? ` — ${connector.name}` : ""}.`,
    };
  }

  if (
    includesAny(text, [
      "file library",
      "files library",
      "open files",
      "my files",
    ]) ||
    (includesAny(text, ["files"]) &&
      includesAny(text, ["library", "upload", "uploads"]) &&
      !includesAny(text, ["image", "photo", "video", "studio"]))
  ) {
    return {
      space: "studio",
      reply:
        "Those files live in Studio → Assets — stills, briefs, exports, and uploads in one library.",
    };
  }

  const workAsk =
    includesAny(text, [
      "email",
      "meeting",
      "follow up",
      "follow-up",
      "inbox",
      "proposal",
      "slack",
      "respond to",
    ]) ||
    (includesAny(text, ["customer", "customers", "crm"]) &&
      !includesAny(text, [
        "build",
        "app",
        "website",
        "portal",
        "make me",
        "make a",
      ]));

  if (workAsk && !connecting) {
    const project =
      mentioned?.space === "work"
        ? mentioned
        : projects.find(
            (item) => item.space === "work" && item.workspaceId === workspaceId,
          );
    return finish({
      space: "work",
      projectId: project?.id ?? mentioned?.id,
      reply: `Work is the right place for this${project ? ` — ${project.name}` : ""}. I’ll keep the open items with this chat.`,
    });
  }

  if (
    includesAny(text, ["calendar"]) &&
    !connecting &&
    includesAny(text, ["meeting", "prep", "prepare", "today", "tomorrow", "schedule"])
  ) {
    const project =
      mentioned?.space === "work"
        ? mentioned
        : projects.find((item) => item.id === "launch-sync") ??
          projects.find(
            (item) => item.space === "work" && item.workspaceId === workspaceId,
          );
    return finish({
      space: "work",
      projectId: project?.id ?? mentioned?.id,
      reply: "I’ll use Work to get you ready — calendar and follow-ups stay with this chat.",
    });
  }

  if (
    includesAny(text, [
      "vacation",
      "subscription",
      "subscriptions",
      "reservation",
      "birthday",
      "bills",
      "this weekend",
      "weekend",
    ])
  ) {
    const project =
      mentioned?.space === "personal"
        ? mentioned
        : projects.find(
            (item) =>
              item.space === "personal" && item.workspaceId === workspaceId,
          );
    return finish({
      space: "personal",
      projectId: project?.id ?? mentioned?.id,
      reply: `Personal is for life admin${project ? ` — ${project.name}` : ""}. I’ll keep it separate from product work.`,
    });
  }

  if (
    includesAny(text, [
      "every monday",
      "every week",
      "schedule this",
      "scheduled",
      "recurring",
      "remind",
      "weekly",
      "daily",
      "monitor",
    ]) &&
    !includesAny(text, ["meeting", "calendar", "inbox"])
  ) {
    const job =
      scheduledJobs.find((item) =>
        mentioned ? item.projectId === mentioned.id : false,
      ) ?? scheduledJobs[0];
    return finish({
      space: "build",
      projectId: mentioned?.id ?? job.projectId,
      jobId: job.id,
      reply: `This will run on a schedule in Build. I attached it${mentioned ? ` to ${mentioned.name}` : ""} so it also shows on that project.`,
    });
  }

  if (includesAny(text, ["skill", "skills", "tone of voice"])) {
    return finish({
      space: "build",
      reply:
        "Tasks live in Build. Name it, say when it should run, and I’ll keep the instructions with this chat.",
    });
  }

  if (
    includesAny(text, [
      "invoice",
      "invoices",
      "runway",
      "budget",
      "spend",
      "finance",
      "finances",
      "cash",
    ])
  ) {
    const project =
      mentioned?.space === "finances"
        ? mentioned
        : projects.find(
            (item) => item.space === "finances" && item.workspaceId === workspaceId,
          );
    return finish({
      space: "personal",
      projectId: project?.id ?? mentioned?.id,
      reply: `Opened Personal → Money${project ? ` on ${project.name}` : ""}. Invoices, spend, and runway stay with this chat.`,
    });
  }

  if (
    includesAny(text, [
      "health",
      "benefits",
      "care plan",
      "wellness",
      "lab results",
    ])
  ) {
    const project =
      mentioned?.space === "health"
        ? mentioned
        : projects.find(
            (item) => item.space === "health" && item.workspaceId === workspaceId,
          );
    return finish({
      space: "personal",
      projectId: project?.id ?? mentioned?.id,
      reply: `Opened Personal → Health${project ? ` on ${project.name}` : ""}. Care plans and benefits stay with this chat.`,
    });
  }

  if (
    includesAny(text, [
      "goal",
      "goals",
      "resolutions",
    ])
  ) {
    const project =
      mentioned?.id === "annual-goals"
        ? mentioned
        : projects.find(
            (item) =>
              item.id === "annual-goals" && item.workspaceId === workspaceId,
          );
    return finish({
      space: "personal",
      projectId: project?.id ?? mentioned?.id,
      reply: `Opened Personal → Goals${project ? ` on ${project.name}` : ""}. I’ll keep this with the rest of life admin.`,
    });
  }

  if (
    includesAny(text, [
      "car",
      "registration",
      "oil change",
      "loaner",
      "dmv",
    ])
  ) {
    const project =
      mentioned?.id === "car-service"
        ? mentioned
        : projects.find(
            (item) =>
              item.id === "car-service" && item.workspaceId === workspaceId,
          );
    return finish({
      space: "personal",
      projectId: project?.id ?? mentioned?.id,
      reply: `Opened Personal → Car${project ? ` on ${project.name}` : ""}. Service, insurance, and registration stay with this chat.`,
    });
  }

  if (
    includesAny(text, [
      "image",
      "photo",
      "video",
      "logo",
      "presentation",
      "deck",
      "ad",
      "ads",
      "background",
      "canvas",
      "studio",
      "crop",
      "timeline",
      "text to video",
      "retouch",
    ])
  ) {
    const project =
      mentioned ??
      projects.find(
        (item) => item.space === "studio" && item.workspaceId === workspaceId,
      ) ??
      projects.find((item) => item.space === "studio");
    const presentation = includesAny(text, ["presentation", "deck"]);
    return finish({
      space: "studio",
      projectId: project?.id,
      reply: presentation
        ? `Studio can turn this into a presentation${project ? ` — ${project.name}` : ""}. Canvas and export stay with this chat.`
        : `Studio is on the right${project ? ` — ${project.name}` : ""}. Canvas, layers, and export stay with this project.`,
    });
  }

  if (
    includesAny(text, [
      "research",
      "competitor",
      "competitors",
      "pricing",
      "sources",
      "cite",
      "compare",
      "teach me",
      "sourced report",
    ]) &&
    !includesAny(text, ["landing", "website", "page.tsx"])
  ) {
    const project =
      mentioned?.space === "research"
        ? mentioned
        : (projects.find((item) => item.id === "competitor-research") ??
          mentioned);
    return finish({
      space: "research",
      projectId: project?.id ?? mentioned?.id,
      reply:
        mentioned && mentioned.space === "build"
          ? `Research is attached to ${mentioned.name}. Sources are on the right; Build stays in the same project history.`
          : `Opened Research. Sources and notes are on the right.`,
    });
  }

  if (
    includesAny(text, [
      "website",
      "app",
      "apps",
      "automation",
      "api",
      "deploy",
      "debug",
      "preview",
      "browser",
      "landing",
    ])
  ) {
    const buildProject =
      mentioned ??
      projects.find(
        (item) => item.space === "build" && item.workspaceId === workspaceId,
      ) ??
      projects.find((item) => item.space === "build");
    return finish({
      space: "build",
      projectId: buildProject?.id,
      buildTool: includesAny(text, ["terminal", "log", "debug"])
        ? "terminal"
        : "preview",
      reply: `Opened Build${buildProject ? ` on ${buildProject.name}` : ""}. The working surface is on the right — chat stays the command layer.`,
    });
  }

  if (isChatSpace(currentSpace)) {
    return {
      space: currentSpace,
      projectId: mentioned?.id,
      reply: `I’ll stay in ${spaceNames[currentSpace] ?? "this Space"} and take it from here.`,
    };
  }

  const buildProject =
    mentioned ??
    projects.find(
      (item) => item.space === "build" && item.workspaceId === workspaceId,
    ) ??
    projects.find((item) => item.space === "build");

  return {
    space: "build",
    projectId: buildProject?.id,
    buildTool: includesAny(text, ["terminal", "log"]) ? "terminal" : "preview",
    reply: `Opened Build${buildProject ? ` on ${buildProject.name}` : ""}. The working surface is on the right — chat stays the command layer.`,
  };
}

export function nextId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
