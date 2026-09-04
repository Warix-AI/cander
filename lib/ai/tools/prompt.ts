/**
 * Shared tool-protocol rules for Cloud (Edge) and Apple on-device prompts.
 * Keep Edge PRODUCT_SYSTEM_PROMPT aligned with CANDER_TOOL_PROTOCOL_RULES.
 */

export const CANDER_TOOL_PROTOCOL_RULES = `In-app tools — ONLY when listed below for this turn. Otherwise reply in plain language with NO JSON and NO tools.

When you do need to act, end your reply with exactly one JSON object on its own line:
{"tool":"<name>","arguments":{...}}
Rules:
- DEFAULT: no tool. Chitchat, opinions, and general knowledge never need tools.
- Never invent workspace_id, UUIDs, or ask the user for them.
- Never call workspace.search unless the user asks about their own projects/workspace.
- For internal business facts (pricing, policies, “our customers”, knowledge bases), call knowledge.search and ground the answer in returned excerpts. If empty, say you don’t have that in workspace docs and suggest uploading a knowledge-base file — never invent company pricing or policies.
- For live/public facts (news, weather, scores, “latest”, look up online), call web.search and ground the answer in returned links/snippets. If empty or unavailable, say so — don’t invent headlines.
- Never invent tools that are not listed. For complex coding/research use create_work_task only.
- Navigate spaces with nav.open: target one of new_chat, work, build, research, studio, recents, connectors, settings. "Explore" (and spoken "Home") means research. "Create" (and spoken "Build" / "Studio") means studio — Build projects still use internal id build when opened.
- panel.open is only for the side panel or a known projectId — not for switching spaces.
- Create projects with project.create only after you know title and space (build or research). If missing, use ui.ask_clarification with single_choice: Build (id build) and Home (id research). Never say “research” to the user — say Home.
- Open a project via workspace.search then project.open only when they ask to open/find a project.
- One JSON object only. No trailing commas. Do not append {"error":...}.
- Prefer a short human sentence; add tool JSON only if acting.`;

export const CANDER_NO_TOOLS_THIS_TURN = `No tools are available for this turn. Answer in plain language only. Do not emit JSON tool calls.`;

/** Full static catalog (Edge builds a subset per turn). */
export const CANDER_TOOL_CATALOG_FOR_EDGE = `Available tools and arguments:
- nav.open: { "target": "new_chat"|"work"|"build"|"research"|"recents"|"connectors"|"settings", "settingsTab"?: string }
- panel.open: { "projectId"?: string, "mode"?: string }
- panel.close: {}
- project.create: { "title": string, "space"?: "build"|"research"|"work", "kind"?: string, "summary"?: string }
- project.open: { "projectId": string }
- workspace.search: { "query": string }
- knowledge.search: { "query": string }
- web.search: { "query": string }
- ui.ask_clarification: { "title": string, "description"?: string, "questions": [{ "id", "type", "label", "choices"?: [{ "id", "label" }], "required"?: boolean }], "resumeTool"?: string, "resumeArguments"?: object }
- ui.confirm: { "title": string, "message": string, "confirmLabel"?: string }
- create_work_task: { "title": string, "goal": string, "kind": "coding"|"research"|"multi_step", "summary"?: string }
- check_work_task: { "workTaskId"?: string }
- request_publish_approval: { "projectId"?: string, "message"?: string }`;

const EDGE_TOOL_LINES: Record<string, string> = {
  "nav.open":
    '- nav.open: { "target": "new_chat"|"work"|"build"|"research"|"recents"|"connectors"|"settings", "settingsTab"?: string }',
  "panel.open": '- panel.open: { "projectId"?: string, "mode"?: string }',
  "panel.close": "- panel.close: {}",
  "project.create":
    '- project.create: { "title": string, "space"?: "build"|"research"|"work", "kind"?: string, "summary"?: string }',
  "project.open": '- project.open: { "projectId": string }',
  "workspace.search": '- workspace.search: { "query": string }',
  "knowledge.search": '- knowledge.search: { "query": string }',
  "web.search": '- web.search: { "query": string }',
  "ui.ask_clarification":
    '- ui.ask_clarification: { "title": string, "description"?: string, "questions": [{ "id", "type", "label", "choices"?: [{ "id", "label" }], "required"?: boolean }], "resumeTool"?: string, "resumeArguments"?: object }',
  "ui.confirm":
    '- ui.confirm: { "title": string, "message": string, "confirmLabel"?: string }',
  create_work_task:
    '- create_work_task: { "title": string, "goal": string, "kind": "coding"|"research"|"multi_step", "summary"?: string }',
  check_work_task: '- check_work_task: { "workTaskId"?: string }',
  request_publish_approval:
    '- request_publish_approval: { "projectId"?: string, "message"?: string }',
};

/** Build Edge-facing catalog lines for an allowed tool name list. */
export function formatEdgeToolCatalog(toolNames: string[]): string {
  if (!toolNames.length) return CANDER_NO_TOOLS_THIS_TURN;
  const lines = toolNames
    .map((n) => EDGE_TOOL_LINES[n])
    .filter(Boolean);
  if (!lines.length) return CANDER_NO_TOOLS_THIS_TURN;
  return ["Available tools and arguments:", ...lines].join("\n");
}
