/**
 * Shared tool-protocol rules for Cloud (Edge) and Apple on-device prompts.
 * Keep Edge PRODUCT_SYSTEM_PROMPT aligned with CANDER_TOOL_PROTOCOL_RULES.
 */

export const CANDER_TOOL_PROTOCOL_RULES = `In-app tools — end your reply with exactly one JSON object on its own line when you need to act:
{"tool":"<name>","arguments":{...}}
Rules:
- Never invent workspace_id, UUIDs, or ask the user for them.
- Navigate spaces with nav.open: target one of new_chat, work, build, research, recents, connectors, settings. "Explore" means research.
- panel.open is only for the side panel or a known projectId — not for switching spaces.
- Create projects with project.create only after you know title and space (build or research). If missing, use ui.ask_clarification with single_choice questions: space choices Build (id build) and Explore (id research), plus a title text field when needed. Never say “research” in user-facing copy — say Explore. Never use a free-text field for space.
- Open a project by searching workspace.search then project.open with the matched id.
- One JSON object only. No trailing commas. Do not append {"error":...}.
- Prefer a short human sentence plus the tool JSON. If no tool is needed, reply normally with no JSON.`;

/** Static catalog text for Edge (Deno cannot import the Next registry). */
export const CANDER_TOOL_CATALOG_FOR_EDGE = `Available tools and arguments:
- nav.open: { "target": "new_chat"|"work"|"build"|"research"|"recents"|"connectors"|"settings", "settingsTab"?: string }
- panel.open: { "projectId"?: string, "mode"?: string }
- panel.close: {}
- project.create: { "title": string, "space"?: "build"|"research"|"work", "kind"?: string, "summary"?: string }
- project.open: { "projectId": string }
- workspace.search: { "query": string }
- ui.ask_clarification: { "title": string, "description"?: string, "questions": [{ "id", "type", "label", "choices"?: [{ "id", "label" }], "required"?: boolean }], "resumeTool"?: string, "resumeArguments"?: object }
- ui.confirm: { "title": string, "message": string, "confirmLabel"?: string }`;
