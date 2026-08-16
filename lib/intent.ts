import { connectors, projects, scheduledJobs, spaces } from "./data";
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

export function inferIntent(raw: string, workspaceId: string): Intent {
  const text = raw.toLowerCase();
  const mentioned = projects.find((project) =>
    text.includes(project.name.toLowerCase()),
  );

  if (
    includesAny(text, [
      "stripe",
      "gmail",
      "github",
      "slack",
      "calendar",
      "connect",
      "connector",
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
      reply: `Opened Connectors on ${connector.name}. Accounts, permissions, and available actions are on the right.`,
    };
  }

  if (
    includesAny(text, [
      "every monday",
      "every week",
      "schedule",
      "scheduled",
      "recurring",
      "remind",
      "weekly",
      "daily",
      "monitor",
    ])
  ) {
    const job =
      scheduledJobs.find((item) =>
        mentioned ? item.projectId === mentioned.id : false,
      ) ?? scheduledJobs[0];
    return {
      space: "scheduled",
      projectId: mentioned?.id ?? job.projectId,
      jobId: job.id,
      reply: `This will run from Scheduled. I attached it${mentioned ? ` to ${mentioned.name}` : ""} so it also shows on that project.`,
    };
  }

  if (includesAny(text, ["skill", "skills", "tone of voice"])) {
    return {
      space: "skills",
      reply:
        "Skills is on the right. Name it, say when it should run, and I’ll keep the instructions with this chat.",
    };
  }

  if (
    includesAny(text, [
      "image",
      "photo",
      "video",
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
    return {
      space: "studio",
      projectId: project?.id,
      reply: `Studio is on the right${project ? ` — ${project.name}` : ""}. Canvas, layers, and export stay with this project.`,
    };
  }

  if (
    includesAny(text, [
      "research",
      "competitor",
      "pricing",
      "sources",
      "cite",
      "compare",
    ]) &&
    !includesAny(text, ["landing", "website", "page.tsx"])
  ) {
    const project =
      mentioned?.space === "research"
        ? mentioned
        : (projects.find((item) => item.id === "competitor-research") ??
          mentioned);
    return {
      space: "research",
      projectId: project?.id ?? mentioned?.id,
      reply:
        mentioned && mentioned.space === "build"
          ? `Research is attached to ${mentioned.name}. Sources are on the right; Build stays in the same project history.`
          : `Opened Research. Sources and notes are on the right.`,
    };
  }

  if (
    includesAny(text, [
      "research",
      "pricing",
    ]) && mentioned?.id === "cander"
  ) {
    return {
      space: "build",
      projectId: "cander",
      buildTool: "editor",
      reply:
        "This belongs to Cander. I filed the competitor notes under Research and opened the pricing page in Build. One project, both surfaces.",
    };
  }

  if (includesAny(text, ["preview", "browser"])) {
    return {
      space: "build",
      projectId: mentioned?.id ?? "cander",
      buildTool: "preview",
      reply: "Preview is live on the right. Chat stays open if you want another pass.",
    };
  }

  const spaceLabel =
    spaces.find((item) => text.includes(item.id))?.id ?? "build";
  const buildProject =
    mentioned ??
    projects.find(
      (item) => item.space === "build" && item.workspaceId === workspaceId,
    ) ??
    projects.find((item) => item.space === "build");

  return {
    space: spaceLabel === "build" ? "build" : spaceLabel,
    projectId: buildProject?.id,
    buildTool: includesAny(text, ["terminal", "log"]) ? "terminal" : "preview",
    reply: `Opened Build${buildProject ? ` on ${buildProject.name}` : ""}. The working surface is on the right — chat stays the command layer.`,
  };
}

export function nextId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
