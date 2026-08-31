/**
 * Ultra-short tool cards for the ~3B model — never dump full JSON schemas.
 */

import type { ToolCard } from "./types.ts";

const PURPOSE: Record<string, { purpose: string; argsHint: string }> = {
  "web.search": {
    purpose: "Search the live web",
    argsHint: "{query}",
  },
  "web.open": {
    purpose: "Open a public URL and read text",
    argsHint: "{url}",
  },
  "web.read": {
    purpose: "Read a public page",
    argsHint: "{url}",
  },
  "web.research": {
    purpose: "Deeper multi-source web research",
    argsHint: "{query}",
  },
  "workspace.search": {
    purpose: "Search projects in this workspace",
    argsHint: "{query?}",
  },
  "knowledge.search": {
    purpose: "Search workspace knowledge",
    argsHint: "{query}",
  },
  "nav.open": {
    purpose: "Open an in-app route",
    argsHint: "{target}",
  },
  "panel.open": {
    purpose: "Open a side panel",
    argsHint: "{panel}",
  },
  "panel.close": {
    purpose: "Close a side panel",
    argsHint: "{}",
  },
  "project.create": {
    purpose: "Create a project",
    argsHint: "{title?}",
  },
  "project.open": {
    purpose: "Open a project",
    argsHint: "{projectId|title}",
  },
  "browser.current.get_context": {
    purpose: "Read the active right-panel tab",
    argsHint: "{}",
  },
  "browser.current.get_selection": {
    purpose: "Read page selection",
    argsHint: "{}",
  },
  "browser.current.capture_viewport": {
    purpose: "Capture the active viewport",
    argsHint: "{}",
  },
  "browser.current.get_metadata": {
    purpose: "Active tab metadata only",
    argsHint: "{}",
  },
  "computer.browser.open": {
    purpose: "Open remote browser for JS/auth pages",
    argsHint: "{url}",
  },
  "computer.browser.observe": {
    purpose: "Observe remote browser page",
    argsHint: "{}",
  },
  "computer.browser.click": {
    purpose: "Click in remote browser",
    argsHint: "{selector|ref}",
  },
  "computer.browser.fill": {
    purpose: "Fill a field in remote browser",
    argsHint: "{selector,value}",
  },
  "computer.browser.requestUserControl": {
    purpose: "Hand control to the user",
    argsHint: "{}",
  },
  "build.spec.read": {
    purpose: "Read BuildSpec slice",
    argsHint: "{projectId?}",
  },
  "build.spec.patch": {
    purpose: "Propose BuildSpec delta",
    argsHint: "{delta}",
  },
  "build.page.add": {
    purpose: "Add a page route",
    argsHint: "{route,title?}",
  },
  "build.component.search": {
    purpose: "Find 3–5 components",
    argsHint: "{query,role?}",
  },
  "build.component.replace": {
    purpose: "Replace a component",
    argsHint: "{role,componentId?}",
  },
  "build.recipe.apply": {
    purpose: "Apply a versioned recipe",
    argsHint: "{recipeId}",
  },
  "build.auth.configure": {
    purpose: "Configure auth recipe",
    argsHint: "{recipeId?}",
  },
  "build.dependencies.ensure": {
    purpose: "Ensure dependencies",
    argsHint: "{}",
  },
  "build.validate": {
    purpose: "Validate draft build",
    argsHint: "{}",
  },
  "build.preview.inspect": {
    purpose: "Inspect draft preview",
    argsHint: "{}",
  },
  "build.publish": {
    purpose: "Gate publish of Validated Draft",
    argsHint: "{projectId?}",
  },
  "computer.files.read": {
    purpose: "Read sandbox file (repair)",
    argsHint: "{path}",
  },
  "computer.files.write": {
    purpose: "Write sandbox file (repair)",
    argsHint: "{path,content}",
  },
  "computer.files.patch": {
    purpose: "Patch sandbox file (repair)",
    argsHint: "{path,patch}",
  },
  "computer.files.list": {
    purpose: "List sandbox files",
    argsHint: "{path?}",
  },
  "computer.exec": {
    purpose: "Allowlisted sandbox exec (repair)",
    argsHint: "{command,args?}",
  },
  "computer.port.expose": {
    purpose: "Expose preview port",
    argsHint: "{port?}",
  },
  "ui.ask_clarification": {
    purpose: "Ask a structured clarifying question",
    argsHint: "{title,questions}",
  },
  "ui.confirm": {
    purpose: "Ask for confirmation",
    argsHint: "{message}",
  },
};

export function toolCardFor(name: string): ToolCard {
  const meta = PURPOSE[name];
  return {
    name,
    purpose: meta?.purpose ?? name,
    argsHint: meta?.argsHint ?? "{}",
  };
}

export function formatToolCardsForPrompt(cards: ToolCard[]): string {
  if (!cards.length) {
    return "No tools are available this turn. Answer from context and evidence only.";
  }
  const lines = [
    "Tools (call at most one per round; prefer answering when evidence is enough):",
  ];
  for (const c of cards) {
    lines.push(`- ${c.name}: ${c.purpose}. args ${c.argsHint}`);
  }
  return lines.join("\n");
}

/** Cap + map names to short cards. Prefer 0–3; hard max 5. */
export function selectToolCards(
  names: string[],
  opts?: { max?: number; clarificationAllowed?: boolean },
): ToolCard[] {
  const max = opts?.max ?? 5;
  let filtered = names.filter(Boolean);
  if (!opts?.clarificationAllowed) {
    filtered = filtered.filter(
      (n) => n !== "ui.ask_clarification" && n !== "ui.confirm",
    );
  }
  // Prefer lighter tools over computer.* when capping
  const rank = (n: string) => {
    if (n.startsWith("computer.files") || n === "computer.exec") return 55;
    if (n.startsWith("computer.")) return 50;
    if (n === "web.research") return 40;
    if (n.startsWith("browser.")) return 20;
    if (n.startsWith("build.")) return 8;
    if (n.startsWith("web.")) return 10;
    return 15;
  };
  filtered = [...filtered].sort((a, b) => rank(a) - rank(b));
  return filtered.slice(0, max).map(toolCardFor);
}
