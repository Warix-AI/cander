/**
 * Cander front agent (server-only).
 *
 * One agent identity for project chat. It receives the trusted ProjectRuntime,
 * can inspect the draft (file list + file contents from the draft branch) and
 * decides — in one structured output — whether the turn is a question to
 * answer, a planning conversation, a change to hand to the builder, a first
 * build, or a request to go live. Cander executes the decision (starts the job,
 * opens Publish); the model never touches infrastructure directly.
 *
 * Runs on the OpenAI Agents SDK with the chat (Luna) model; tracing on.
 */

import { Agent, Runner, tool, setDefaultOpenAIKey } from "@openai/agents";
import { resolveOpenAIModel } from "@/lib/ai/raw-openai/web-search";
import { inspectProjectDraftTip, readTipFile } from "@/lib/build/git/tip-inspect";
import {
  renderProjectRuntimeForAgent,
  resolveProjectRuntime,
  type ProjectRuntime,
} from "@/lib/build/project-runtime";

import type { FrontAgentAction, FrontAgentDecision } from "@/lib/ai/agent/front-agent-types";

export type { FrontAgentAction, FrontAgentDecision };

export interface FrontAgentTurnInput {
  projectId: string;
  workspaceId: string;
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Whether a draft exists (build_phase ready). Cander knows; the model is told. */
  alreadyBuilt: boolean;
  /** Live-site state, when known. */
  publishState?: "never" | "ahead" | "current" | "unknown";
}

const INSTRUCTIONS = `You are Cander — the user's website and app builder, speaking about THEIR project.

You decide what this message needs and reply in plain English. You never write code in chat and never mention GitHub, Vercel, Supabase, commits, SHAs or sandboxes — say "your draft", "the preview", "your live site".

Actions:
- answer: a question, feedback, thanks or small talk. Reply concretely, using the tools to look at the draft when the question is about the site (pages, copy, structure, what exists). If the user is describing a change but it is ambiguous, ask ONE clarifying question as an answer.
- plan: the user wants to think through goals, themes, pages, structure or features before building. Reply with a short, skim-friendly plan and one next-step question.
- edit: the user wants something changed in the existing draft (add/remove/replace/fix/restyle/rewrite…). Put a self-contained instruction in \`instruction\` (resolve pronouns and "same as" using the history; keep the user's words where possible). Reply with a one-line acknowledgement.
- create: only when NO draft exists yet and the message describes what to build. \`instruction\` = the build spec in the user's words.
- publish: the user wants to go live / republish / deploy. Reply with a one-line acknowledgement.
- undo: the user wants to undo the last change or go back to an earlier version ("undo that", "go back to before the pricing page", "revert"). Call list_versions, choose the version that matches (the one BEFORE the change they want gone; "undo" alone = the previous version), put its id in \`instruction\`, and reply with one line saying what the draft will go back to (by description and time, never ids).

Rules:
- If a draft exists, "build it / go ahead / make it" refers to the last discussed change → edit.
- Questions that are really change requests ("can you make the header darker?") → edit.
- Keep replies short. No headings unless listing pages. No markdown code blocks.`;

const DECISION_SCHEMA = {
  type: "json_schema" as const,
  name: "cander_turn_decision",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      action: { type: "string", enum: ["answer", "plan", "edit", "create", "publish", "undo"] },
      reply: { type: "string" },
      instruction: { type: ["string", "null"] },
    },
    required: ["action", "reply", "instruction"] as Array<"action" | "reply" | "instruction">,
    additionalProperties: false as const,
  },
};

const MAX_FILE_CHARS = 12_000;

function makeTools(rt: ProjectRuntime) {
  const listFiles = tool({
    name: "list_files",
    description: "List the files in the user's current draft (repo-relative paths). Use to learn which pages/components exist.",
    parameters: { type: "object", properties: {}, additionalProperties: false, required: [] },
    strict: true,
    execute: async () => {
      const tip = await inspectProjectDraftTip({ projectId: rt.projectId, workspaceId: rt.workspaceId, maxPaths: 300 });
      if (!tip.draftSha) return "The draft has no files yet.";
      if (!tip.paths.length) {
        return "The draft exists but its file list is unavailable right now. Answer from the project state and do not claim the site is empty.";
      }
      const routes = tip.paths
        .filter((p) => /^app\/.*page\.tsx$/.test(p))
        .map((p) => (p.replace(/^app/, "").replace(/\/page\.tsx$/, "").replace(/\/\([^)]+\)/g, "") || "/"));
      return `Routes: ${routes.join(", ") || "(none)"}\nFiles (${tip.paths.length}):\n${tip.paths.join("\n")}`;
    },
  });
  const readFile = tool({
    name: "read_file",
    description: "Read one file from the user's current draft to answer precisely (copy, structure, styles).",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Repo-relative path from list_files." } },
      required: ["path"],
      additionalProperties: false,
    },
    strict: true,
    execute: async (raw: unknown) => {
      const args = (raw ?? {}) as { path?: string };
      const path = String(args.path ?? "").replace(/^\/+/, "");
      if (!path || path.includes("..")) return "ERROR: invalid path";
      const tip = await inspectProjectDraftTip({ projectId: rt.projectId, workspaceId: rt.workspaceId, maxPaths: 1 });
      if (!tip.draftSha || !tip.githubFullName) return "The draft has no files yet.";
      const content = await readTipFile({ fullName: tip.githubFullName, draftSha: tip.draftSha, path });
      if (content === null) return `ERROR: ${path} not found in the draft`;
      return content.length > MAX_FILE_CHARS ? `${content.slice(0, MAX_FILE_CHARS)}\n…(truncated)` : content;
    },
  });
  const listVersions = tool({
    name: "list_versions",
    description: "Recent saved versions of the draft, newest first: id, when, and what changed. Use for undo / go back requests.",
    parameters: { type: "object", properties: {}, additionalProperties: false, required: [] },
    strict: true,
    execute: async () => {
      const { listDraftCommits } = await import("@/lib/build/git/draft-history");
      const { commits, tipSha } = await listDraftCommits({ projectId: rt.projectId, workspaceId: rt.workspaceId, limit: 15 });
      if (!commits.length) return "No saved versions yet.";
      return commits
        .map((c, i) => {
          const when = c.authorDate ? new Date(c.authorDate).toISOString().replace("T", " ").slice(0, 16) : "unknown time";
          const label = c.title.replace(/^Cander:\s*/i, "").replace(/^Cander checkpoint:\s*/i, "checkpoint: ");
          return `${i === 0 && c.sha === tipSha ? "[current] " : ""}id=${c.sha} · ${when} · ${label}`;
        })
        .join("\n");
    },
  });
  return [listFiles, readFile, listVersions];
}

let keyConfigured = false;

export async function runFrontAgentTurn(input: FrontAgentTurnInput): Promise<FrontAgentDecision> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured.");
  if (!keyConfigured) {
    setDefaultOpenAIKey(apiKey);
    keyConfigured = true;
  }

  const rt = await resolveProjectRuntime({ projectId: input.projectId, workspaceId: input.workspaceId });

  const agent = new Agent({
    name: "Cander",
    instructions: [
      INSTRUCTIONS,
      `Project state (trusted):\n${renderProjectRuntimeForAgent(rt)}`,
      `Draft exists: ${input.alreadyBuilt ? "yes" : "no"}.`,
      input.publishState && input.publishState !== "unknown"
        ? `Live site: ${input.publishState === "never" ? "never published" : input.publishState === "ahead" ? "published, but the draft has newer changes" : "published and up to date with the draft"}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    model: resolveOpenAIModel(),
    modelSettings: { store: true, reasoning: { effort: "low" } },
    tools: makeTools(rt),
    outputType: DECISION_SCHEMA,
  });

  const history = (input.history ?? [])
    .filter((m) => m.content?.trim())
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 1200) }));

  const runner = new Runner({ workflowName: "cander.project_turn", groupId: input.projectId });
  const result = await runner.run(
    agent,
    [
      ...history.map((m) =>
        m.role === "user"
          ? ({ role: "user" as const, content: m.content })
          : ({ role: "assistant" as const, status: "completed" as const, content: [{ type: "output_text" as const, text: m.content }] }),
      ),
      { role: "user" as const, content: input.message },
    ],
    { maxTurns: 8 },
  );

  const out = result.finalOutput as Partial<FrontAgentDecision> | string | undefined;
  const parsed: Partial<FrontAgentDecision> =
    typeof out === "string" ? (safeParse(out) ?? { action: "answer", reply: out }) : out ?? {};
  const action: FrontAgentAction = (["answer", "plan", "edit", "create", "publish", "undo"] as const).includes(
    parsed.action as FrontAgentAction,
  )
    ? (parsed.action as FrontAgentAction)
    : "answer";
  return {
    action: action === "create" && input.alreadyBuilt ? "edit" : action,
    reply: String(parsed.reply ?? "").trim(),
    instruction: parsed.instruction ? String(parsed.instruction).trim() : null,
  };
}

function safeParse(text: string): Partial<FrontAgentDecision> | null {
  try {
    return JSON.parse(text) as Partial<FrontAgentDecision>;
  } catch {
    return null;
  }
}
