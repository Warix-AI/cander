/**
 * Build project chat turns.
 *
 * Architecture:
 * - Plan / clarify (themes, URLs, UI, goals) → normal chat model, no code dumps.
 * - Implement / create → Codex (coding model) writes files into the sandbox.
 * Sites use crawlable Next.js App Router SSR (server components + metadata).
 */

import type {
  AgentTurnOptions,
  AgentTurnResult,
} from "@/lib/ai/runtime/agent-turn";
import { runRawOpenAITurn } from "@/lib/ai/raw-openai/run-turn";
import {
  executeAuthorizedTool,
  formatToolsForPrompt,
  type AiToolCallResult,
} from "@/lib/ai/runtime/tools";
import type { AiGenerateRequest } from "@/lib/ai/runtime/types";
import {
  parseToolCallFromContent,
  sanitizeAssistantVisibleText,
} from "@/lib/ai/tool-protocol";
import { TOOL_DOMAINS } from "@/lib/ai/tools/domains";
import {
  isBuildCreateIntent,
  isBuildIntent,
} from "@/lib/ai/build/capabilities";

const MAX_ROUNDS = 10;

const PLAN_INTENT_RE =
  /\b(plan|planning|brainstorm|outline|theme|themes|mood\s*board|wireframe|sitemap|ia\b|information\s*architecture|what\s+should|help\s+me\s+(decide|figure)|before\s+we\s+build|don'?t\s+build\s+yet|just\s+plan)\b/i;

const IMPLEMENT_INTENT_RE =
  /\b(implement|build\s+it|create\s+it|scaffold|ship\s+it|go\s+ahead|make\s+it|write\s+the\s+code|start\s+coding|let'?s\s+build|do\s+it|run\s+supabase|set\s+up\s+supabase)\b/i;

const BUILD_PLAN_INSTRUCTIONS = `You are Cander Build — planning partner for websites and apps.

You help the user clarify what to build BEFORE code exists. Structure replies with short sections when useful:
1. Goal — what the site/app should do
2. Theme & brand — tone, colors, typography direction
3. Structure / URLs — pages or screens and suggested paths
4. UI design — layout, key components, CTA
5. Data & backend — only if needed (auth, Supabase, forms); apps lean heavier here
6. Next step — ask one clear question, or invite them to say "build it" / "implement"

Rules:
- Do NOT paste HTML, JSX, React components, or package.json.
- Do NOT invent file contents. Planning only.
- Keep it concrete and skim-friendly.`;

const BUILD_PROJECT_INSTRUCTIONS = `You are Cander Build — Codex implements IN the user's project sandbox.

Rules:
- Never paste a full HTML/JSX document as the answer. Write real project files with tools.
- Prefer Next.js App Router SSR (server components). Sites must be crawlable: real HTML from the server, metadata title/description, robots.txt + sitemap.
- Use next@16.3.1 (or newer patched), react@19, react-dom@19 — never vulnerable Next 15.0–15.5.6.
- No "use client" on the main landing page unless interactivity is required.
- After scaffolding, persist files (computer.files.write persists by default).
- Keep user-facing replies short: what you built + how to preview. No giant code dumps.
- Call tools as JSON: {"tool":"computer.files.write","arguments":{"path":"app/page.js","content":"..."}}
- Supabase / databases: only when the user asks or the plan clearly needs them — use build.* tools when available.

Workflow for "create a website/app":
1. computer.files.list to see current files (optional).
2. computer.files.write for package.json, next.config.mjs, app/layout.js, app/page.js, app/robots.js, app/sitemap.js, .gitignore.
3. Summarize briefly.`;

function isBuildPlanIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isBuildCreateIntent(t) || IMPLEMENT_INTENT_RE.test(t)) return false;
  return PLAN_INTENT_RE.test(t);
}

function buildToolNames(): string[] {
  return [
    ...TOOL_DOMAINS.build,
    "computer.files.read",
    "computer.files.write",
    "computer.files.patch",
    "computer.files.list",
    "computer.exec",
  ];
}

function formatToolResultsNote(results: AiToolCallResult[]): string {
  return results
    .map((r) => `Tool ${r.name} (${r.ok ? "ok" : "failed"}):\n${r.output}`)
    .join("\n\n");
}

function isBuildToolName(name: string): boolean {
  return (
    name.startsWith("build.") ||
    name.startsWith("computer.files") ||
    name === "computer.exec"
  );
}

function looksLikeCodeDump(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (/<!DOCTYPE\s+html/i.test(t)) return true;
  if (/<html[\s>]/i.test(t) && /<style[\s>]/i.test(t)) return true;
  if (/```(?:html|javascript|tsx|jsx|css|typescript)/i.test(t) && t.length > 280) {
    return true;
  }
  if (
    /\b(?:app\/page\.(?:js|tsx)|package\.json)\b/i.test(t) &&
    /export\s+default\s+function/i.test(t)
  ) {
    return true;
  }
  if (
    /export\s+default\s+function\s+\w+/i.test(t) &&
    /return\s*\(\s*</.test(t) &&
    t.length > 400
  ) {
    return true;
  }
  return false;
}

function labelForBuildTool(name: string): string {
  if (name === "computer.files.write") return "Writing project files…";
  if (name === "computer.files.list") return "Checking project files…";
  if (name === "computer.files.read") return "Reading project file…";
  if (name === "computer.exec") return "Running command…";
  if (name.startsWith("build.")) return "Updating build…";
  return "Working in project…";
}

async function ensureSandboxReady(opts: {
  projectId: string;
  workspaceId: string;
  forceRestart?: boolean;
}): Promise<{ ok: boolean; detail: string }> {
  try {
    const { ensureProjectSandboxClient } = await import(
      "@/lib/api/project-sandbox-client"
    );
    const { ensureProjectInfraClient } = await import(
      "@/lib/api/project-infra-client"
    );
    await ensureProjectInfraClient({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    });
    const result = await ensureProjectSandboxClient({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      forceRestart: opts.forceRestart,
    });
    if (!result) {
      return { ok: false, detail: "Sign in required to start the build environment." };
    }
    if (result.status === "error" || result.ok === false) {
      return {
        ok: false,
        detail: result.message || result.error || "Sandbox failed to start.",
      };
    }
    return {
      ok: true,
      detail: result.message || `Sandbox ${result.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function escapeJsString(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

type FunnelCopy = {
  businessName: string;
  tagline: string;
  hero: string;
  description: string;
  phone: string;
  rating: string;
  problem: string;
  solution: string;
  services: string[];
  cta: string;
};

function defaultFunnelCopy(prompt: string): FunnelCopy {
  const lower = prompt.toLowerCase();
  const tree = /tree|trim|arbor/i.test(lower);
  const name = tree ? "Summit Tree Trimming Co." : "Northline Studio";
  return {
    businessName: name,
    tagline: tree
      ? "Safe, fast tree care for homes & businesses"
      : "A simple site that converts visitors",
    hero: tree
      ? "Safe, Fast Tree Trimming in Your Area"
      : "Built for your next customer",
    description: tree
      ? "Licensed tree trimming, crown reduction, and storm cleanup. Request a free quote."
      : "Clear offer, proof, and one call-to-action for your next customer.",
    phone: "(555) 014-2288",
    rating: "4.9/5 from local homeowners",
    problem: tree
      ? "Overgrown limbs, storm damage, and risky DIY cuts."
      : "Visitors leave before they take action.",
    solution: tree
      ? "Licensed crews, clean finish, and same-week availability."
      : "Clear offer, proof, and one obvious call-to-action.",
    services: tree
      ? ["Tree Trimming", "Crown Reduction", "Storm Cleanup"]
      : ["Strategy", "Design", "Launch"],
    cta: tree ? "Get a free quote" : "Book a call",
  };
}

async function inventFunnelCopy(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<FunnelCopy> {
  const fallback = defaultFunnelCopy(request.content);
  try {
    const generated = await runRawOpenAITurn(
      {
        ...request,
        allowTools: false,
        toolContext: undefined,
        modelMode: "chat",
        content: [
          "Return ONLY compact JSON (no markdown) with keys:",
          "businessName, tagline, hero, description, phone, rating, problem, solution, services (string array of 3), cta.",
          "Invent realistic details for this request:",
          request.content,
        ].join("\n"),
      },
      { ...opts, suppressContentDelta: true },
    );
    const raw = (generated.content || "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return fallback;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<FunnelCopy>;
    return {
      businessName: String(parsed.businessName || fallback.businessName),
      tagline: String(parsed.tagline || fallback.tagline),
      hero: String(parsed.hero || fallback.hero),
      description: String(parsed.description || fallback.description),
      phone: String(parsed.phone || fallback.phone),
      rating: String(parsed.rating || fallback.rating),
      problem: String(parsed.problem || fallback.problem),
      solution: String(parsed.solution || fallback.solution),
      services: Array.isArray(parsed.services)
        ? parsed.services.map((s) => String(s)).filter(Boolean).slice(0, 5)
        : fallback.services,
      cta: String(parsed.cta || fallback.cta),
    };
  } catch {
    return fallback;
  }
}

/**
 * Crawlable Next App Router scaffold — server components, metadata, robots, sitemap.
 */
function scaffoldFiles(copy: FunnelCopy): Array<{ path: string; content: string }> {
  const servicesJs = copy.services
    .map((s) => `"${escapeJsString(s)}"`)
    .join(", ");
  const page = `const services = [${servicesJs}];

export default function HomePage() {
  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <strong>${escapeJsString(copy.businessName)}</strong>
        <a href="tel:${escapeJsString(copy.phone.replace(/[^\d+]/g, ""))}" style={styles.phone}>
          ${escapeJsString(copy.phone)}
        </a>
      </header>
      <section style={styles.hero}>
        <p style={styles.eyebrow}>${escapeJsString(copy.tagline)}</p>
        <h1 style={styles.h1}>${escapeJsString(copy.hero)}</h1>
        <p style={styles.rating}>${escapeJsString(copy.rating)}</p>
        <a href="#contact" style={styles.cta}>${escapeJsString(copy.cta)}</a>
      </section>
      <section style={styles.section}>
        <h2>The problem</h2>
        <p>${escapeJsString(copy.problem)}</p>
        <h2>Our approach</h2>
        <p>${escapeJsString(copy.solution)}</p>
      </section>
      <section style={styles.section}>
        <h2>Services</h2>
        <ul>
          {services.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section id="contact" style={styles.section}>
        <h2>Ready to start?</h2>
        <p>Call ${escapeJsString(copy.phone)} or request a callback — we respond the same day.</p>
        <a href="tel:${escapeJsString(copy.phone.replace(/[^\d+]/g, ""))}" style={styles.cta}>
          ${escapeJsString(copy.cta)}
        </a>
      </section>
    </main>
  );
}

const styles = {
  main: { fontFamily: "Georgia, serif", color: "#14231a", background: "#f7f4ee", margin: 0 },
  header: { display: "flex", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid #ddd4c6" },
  phone: { color: "#14231a", textDecoration: "none", fontWeight: 600 },
  hero: { padding: "64px 24px 48px", maxWidth: 780 },
  eyebrow: { textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 12, opacity: 0.7 },
  h1: { fontSize: "clamp(2rem, 5vw, 3.4rem)", lineHeight: 1.1, margin: "12px 0 16px" },
  rating: { marginBottom: 24, opacity: 0.85 },
  cta: { display: "inline-block", background: "#1f6b3a", color: "#fff", padding: "12px 18px", borderRadius: 999, textDecoration: "none", fontWeight: 600 },
  section: { padding: "28px 24px", maxWidth: 780, borderTop: "1px solid #ddd4c6" },
};
`;

  return [
    {
      path: ".gitignore",
      content: ["node_modules", ".next", ".npm", "package-lock.json", ".DS_Store", ""].join(
        "\n",
      ),
    },
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: "cander-site",
          private: true,
          scripts: {
            dev: "next dev --hostname 0.0.0.0 --port 3000",
            build: "next build",
            start: "next start -p 3000",
          },
          dependencies: {
            next: "16.3.1",
            react: "19.1.0",
            "react-dom": "19.1.0",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "next.config.mjs",
      content: "export default {};\n",
    },
    {
      path: "app/layout.js",
      content: `export const metadata = {
  title: ${JSON.stringify(copy.businessName)},
  description: ${JSON.stringify(copy.description)},
  openGraph: {
    title: ${JSON.stringify(copy.businessName)},
    description: ${JSON.stringify(copy.description)},
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.js",
      content: page,
    },
    {
      path: "app/robots.js",
      content: `export default function robots() {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "/sitemap.xml",
  };
}
`,
    },
    {
      path: "app/sitemap.js",
      content: `export default function sitemap() {
  return [{ url: "/", lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}
`,
    },
  ];
}

async function writeScaffold(opts: {
  projectId: string;
  workspaceId: string;
  files: Array<{ path: string; content: string }>;
  report: NonNullable<AgentTurnOptions["onProgress"]>;
}): Promise<AiToolCallResult[]> {
  const results: AiToolCallResult[] = [];
  for (const file of opts.files) {
    opts.report({
      phase: "tool",
      label: "Building",
      detail: `Writing ${file.path}…`,
      toolName: "computer.files.write",
      contentStreaming: true,
    });
    const result = await executeAuthorizedTool({
      name: "computer.files.write",
      arguments: {
        projectId: opts.projectId,
        workspaceId: opts.workspaceId,
        path: file.path,
        content: file.content,
        persist: true,
      },
    });
    results.push(result);
    opts.report({
      phase: "follow_up",
      label: "Building",
      detail: `Writing ${file.path}…`,
      toolName: "computer.files.write",
      toolOk: result.ok,
      contentStreaming: true,
    });
  }
  return results;
}

async function runBuildPlanTurn(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  report({
    phase: "thinking",
    label: "Planning",
    detail: "Clarifying goals, theme, URLs, and UI…",
  });

  const generated = await runRawOpenAITurn(
    {
      ...request,
      allowTools: false,
      toolContext: BUILD_PLAN_INSTRUCTIONS,
      modelMode: "chat",
      allowedToolNames: undefined,
    },
    opts,
  );

  let content =
    sanitizeAssistantVisibleText(generated.content || "").trim() ||
    generated.content ||
    "";
  if (looksLikeCodeDump(content)) {
    content =
      "Let’s stay in planning mode — no code yet.\n\n" +
      "Tell me more about **goal**, **theme**, **pages/URLs**, and **UI**, " +
      "or say **build it** when you want Codex to implement in your sandbox.";
  }

  return {
    content,
    runtime: generated.runtime ?? "cloud",
    offline: Boolean(generated.offline),
    condensationOccurred: Boolean(generated.condensationOccurred),
    aiChatId: generated.aiChatId ?? request.aiChatId ?? null,
    blocks: generated.blocks,
  };
}

export async function runBuildProjectTurn(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  const projectId = request.projectId?.trim() || "";
  const workspaceId = request.workspaceId?.trim() || "";
  const allowedTools = buildToolNames();
  const toolResults: AiToolCallResult[] = [];
  let forcedToolRetry = false;

  if (!projectId || !workspaceId) {
    return {
      content:
        "Open a Build project first, then ask me to create or edit the site.",
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };
  }

  // Planning stays on the chat model — no sandbox / no file writes.
  if (isBuildPlanIntent(request.content) && !isBuildCreateIntent(request.content)) {
    return runBuildPlanTurn(request, opts);
  }

  report({
    phase: "thinking",
    label: "Preparing environment",
    detail: "Starting project sandbox…",
  });

  const sandbox = await ensureSandboxReady({ projectId, workspaceId });
  if (!sandbox.ok) {
    return {
      content: `I couldn’t start the project environment: ${sandbox.detail}`,
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };
  }

  // Deterministic create path — invent copy with chat model, write SSR scaffold.
  if (isBuildCreateIntent(request.content) || IMPLEMENT_INTENT_RE.test(request.content)) {
    report({
      phase: "thinking",
      label: "Building",
      detail: "Planning copy, then scaffolding a crawlable Next.js site…",
    });
    const copy = await inventFunnelCopy(request, opts);
    const files = scaffoldFiles(copy);
    const written = await writeScaffold({
      projectId,
      workspaceId,
      files,
      report,
    });
    toolResults.push(...written);
    const okWrites = written.filter((r) => r.ok).length;
    const failed = written.filter((r) => !r.ok);

    report({
      phase: "thinking",
      label: "Building",
      detail: "Restarting preview…",
    });
    await ensureSandboxReady({ projectId, workspaceId, forceRestart: true });

    if (okWrites === 0) {
      return {
        content: `I couldn’t write files into the sandbox${
          failed[0]?.output ? `: ${failed[0].output}` : "."
        }`,
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }

    return {
      content: [
        `Built a crawlable draft site for **${copy.businessName}** in your sandbox (${okWrites} files).`,
        "It uses Next.js App Router with server-rendered HTML, metadata, robots, and sitemap so search engines can index it after you publish.",
        "Preview may take a minute while `next dev` installs and starts — use Reload if you still see SANDBOX_NOT_LISTENING.",
        "The public subdomain appears in the address bar only after you publish.",
        failed.length
          ? `Some writes failed: ${failed.map((f) => f.output).join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults,
    };
  }

  report({
    phase: "thinking",
    label: "Building",
    detail: sandbox.detail,
  });

  let working: AiGenerateRequest = {
    ...request,
    allowTools: true,
    allowedToolNames: allowedTools,
    modelMode: "coding",
    toolContext: [
      formatToolsForPrompt(allowedTools),
      BUILD_PROJECT_INSTRUCTIONS,
      `Active projectId: ${projectId}`,
      `workspaceId: ${workspaceId}`,
      "Implement the user's request with computer.files.* tools now. No code dumps in chat.",
    ].join("\n\n"),
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (opts?.signal?.aborted) {
      return {
        content: "",
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults: toolResults.length ? toolResults : undefined,
      };
    }

    if (round > 0) {
      report({
        phase: "follow_up",
        label: "Building",
        detail: "Continuing…",
        contentStreaming: true,
      });
    }

    const generated = await runRawOpenAITurn(working, {
      ...opts,
      suppressContentDelta: true,
    });
    const { text, call } = parseToolCallFromContent(generated.content);

    let toolCall = call;
    if (toolCall && !allowedTools.includes(toolCall.name)) toolCall = null;
    if (toolCall && !isBuildToolName(toolCall.name)) toolCall = null;

    if (!toolCall) {
      const visible =
        sanitizeAssistantVisibleText(text || generated.content).trim() || "";
      const writes = toolResults.filter(
        (r) => r.name === "computer.files.write" && r.ok,
      ).length;
      const needsForce =
        !forcedToolRetry &&
        writes === 0 &&
        (isBuildIntent(request.content) || looksLikeCodeDump(visible));

      if (needsForce) {
        forcedToolRetry = true;
        working = {
          ...working,
          modelMode: "coding",
          toolContext: [
            formatToolsForPrompt(allowedTools),
            BUILD_PROJECT_INSTRUCTIONS,
            formatToolResultsNote(toolResults),
            "CRITICAL: Do not paste code in chat. Call computer.files.write now for package.json, app/layout.js, and app/page.js.",
          ].join("\n\n"),
          content: [
            request.content,
            "",
            "Write the Next.js files with computer.files.write. No code-only replies.",
          ].join("\n"),
        };
        continue;
      }

      // Still dumped code with no writes — fall back to deterministic scaffold.
      if (writes === 0 && looksLikeCodeDump(visible)) {
        report({
          phase: "thinking",
          label: "Building",
          detail: "Writing files into the sandbox instead of chatting code…",
        });
        const copy = await inventFunnelCopy(request, opts);
        const files = scaffoldFiles(copy);
        const written = await writeScaffold({
          projectId,
          workspaceId,
          files,
          report,
        });
        toolResults.push(...written);
        await ensureSandboxReady({ projectId, workspaceId, forceRestart: true });
        const okWrites = written.filter((r) => r.ok).length;
        return {
          content:
            okWrites > 0
              ? `I wrote a crawlable Next.js draft for **${copy.businessName}** into your sandbox (${okWrites} files) instead of pasting code in chat. Reload Preview when ready.`
              : visible.slice(0, 400) || "Couldn’t write files. Try again.",
          runtime: "cloud",
          offline: false,
          condensationOccurred: false,
          aiChatId: request.aiChatId ?? null,
          toolResults,
        };
      }

      return {
        content:
          visible ||
          (writes > 0
            ? `Updated ${writes} file${writes === 1 ? "" : "s"} in your project. Preview should refresh shortly.`
            : "Done."),
        runtime: generated.runtime ?? "cloud",
        offline: Boolean(generated.offline),
        condensationOccurred: Boolean(generated.condensationOccurred),
        aiChatId: generated.aiChatId ?? request.aiChatId ?? null,
        toolResults: toolResults.length ? toolResults : undefined,
        blocks: generated.blocks,
      };
    }

    report({
      phase: "tool",
      label: "Building",
      detail: labelForBuildTool(toolCall.name),
      toolName: toolCall.name,
      contentStreaming: true,
    });

    const result = await executeAuthorizedTool({
      name: toolCall.name,
      arguments: {
        projectId,
        workspaceId,
        ...(toolCall.arguments ?? {}),
      },
    });
    toolResults.push(result);
    report({
      phase: "follow_up",
      label: "Building",
      detail: labelForBuildTool(toolCall.name),
      toolName: toolCall.name,
      toolOk: result.ok,
      contentStreaming: true,
    });

    working = {
      ...working,
      modelMode: "coding",
      toolContext: [
        formatToolsForPrompt(allowedTools),
        BUILD_PROJECT_INSTRUCTIONS,
        formatToolResultsNote(toolResults),
        "Continue with more file writes if needed, then a short user summary — no code dumps.",
      ].join("\n\n"),
      content: request.content,
      messages: [
        ...(request.messages ?? []),
        { role: "assistant", content: generated.content },
        {
          role: "user",
          content: `Tool result for ${result.name}: ${result.ok ? "ok" : "failed"}\n${result.output}`,
        },
      ],
    };
  }

  const writes = toolResults.filter(
    (r) => r.name === "computer.files.write" && r.ok,
  ).length;

  if (writes > 0) {
    try {
      await ensureSandboxReady({ projectId, workspaceId, forceRestart: true });
    } catch {
      /* best-effort */
    }
  }

  return {
    content:
      writes > 0
        ? `Updated ${writes} file${writes === 1 ? "" : "s"} in your project sandbox. Open Preview to see the draft.`
        : "I hit the step limit before finishing. Try again with a narrower request.",
    runtime: "cloud",
    offline: false,
    condensationOccurred: false,
    aiChatId: request.aiChatId ?? null,
    toolResults,
  };
}
