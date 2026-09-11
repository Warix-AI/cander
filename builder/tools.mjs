// Sandbox tools exposed to the coding agent via Responses API function calling.
// All paths are repo-relative and confined to the repo root.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".cander",
  ".vercel",
  ".turbo",
  "dist",
  "coverage",
]);

const BINARY_RE = /\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf|eot|mp4|mp3|pdf|zip|gz)$/i;

const BLOCKED_COMMAND_RE =
  /(^|[\s;&|])(sudo|git\s+(push|reset|checkout|clean|rebase|commit|stash|branch\s+-D)|rm\s+-rf\s+(\/|~|\.\.|\$HOME)|shutdown|reboot|mkfs|dd\s+if=|curl[^|]*\|\s*(ba)?sh|wget[^|]*\|\s*(ba)?sh|chmod\s+-R\s+777\s+\/)/i;

const ALLOWED_COMMAND_PREFIX_RE =
  /^(npm|npx|pnpm|yarn|node|tsc|next|ls|cat|head|tail|wc|find|grep|rg|echo|printf|test|mkdir|cp|mv|rm|touch|curl|git\s+(status|diff|log|show|ls-files)|sed\s+-n|sort|uniq|tr|cut|jq|env|pwd|which|true|sleep|kill|pkill|ps)\b/;


/**
 * Shell snippet that mirrors the working tree into an isolated build dir and
 * runs `next build` there with NODE_ENV=production. The dev server owns
 * `<repo>/.next`; a production build in the same directory races it for the
 * Turbopack cache and knocks the preview over. Publish preflight already builds
 * in a detached worktree; acceptance and the coder's own builds must match it.
 */
export const ISOLATED_BUILD_DIR = "/tmp/cander-verify-build";
export function isolatedBuildScript(repoDir, buildCmd = "npx --no-install next build") {
  const src = JSON.stringify(repoDir.replace(/\/$/, "") + "/");
  const dst = JSON.stringify(ISOLATED_BUILD_DIR);
  return [
    "set -o pipefail",
    `SRC=${src}; DST=${dst}`,
    'mkdir -p "$DST"',
    // Mirror sources; keep the destination's own .next (incremental) but never
    // sandbox home-dir clutter.
    "if command -v rsync >/dev/null 2>&1; then",
    '  rsync -a --delete --exclude node_modules --exclude .next --exclude .git --exclude .cander --exclude .cache --exclude .codex --exclude .config --exclude .local --exclude .npm --exclude .global --exclude .npmrc --exclude tsconfig.tsbuildinfo "$SRC" "$DST/"',
    "else",
    '  find "$DST" -mindepth 1 -maxdepth 1 ! -name .next ! -name node_modules -exec rm -rf {} +',
    '  (cd "$SRC" && tar cf - --exclude=./node_modules --exclude=./.next --exclude=./.git --exclude=./.cander --exclude=./.cache --exclude=./.codex --exclude=./.config --exclude=./.local --exclude=./.npm --exclude=./.global --exclude=./.npmrc .) | (cd "$DST" && tar xf -)',
    "fi",
    // Turbopack refuses a node_modules symlink that points outside its root,
    // so mirror deps with hardlinks (falls back to a copy across filesystems).
    // Refresh only when the dependency manifest changed.
    'STAMP="$DST/.node_modules.stamp"',
    'if [ ! -d "$DST/node_modules" ] || [ ! -f "$STAMP" ] || [ "$SRC"package.json -nt "$STAMP" ] || { [ -f "$SRC"package-lock.json ] && [ "$SRC"package-lock.json -nt "$STAMP" ]; }; then',
    '  rm -rf "$DST/node_modules"',
    '  cp -al "$SRC"node_modules "$DST/node_modules" 2>/dev/null || { rm -rf "$DST/node_modules"; cp -a "$SRC"node_modules "$DST/node_modules"; }',
    '  touch "$STAMP"',
    "fi",
    // Dev-mode artifacts must never leak into the production build.
    'rm -rf "$DST/.next/dev" 2>/dev/null || true',
    // The builder process runs with NODE_ENV=development (for the preview
    // server). Inheriting that into `next build` makes Next 16 bundle the
    // development React and crash while prerendering /_global-error
    // ("Cannot read properties of null (reading 'useContext')", React key
    // warnings in a prod build — vercel/next.js#87719). Force production.
    `cd "$DST" && NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 CI=1 ${buildCmd} 2>&1 | tail -n 400`,
  ].join("\n");
}

/** `next build` / `npm run build` typed by the coder — must not run beside the dev server. */
const PRODUCTION_BUILD_CMD_RE =
  /^(?:[A-Z_][A-Z0-9_]*=\S+\s+)*(?:npm\s+run\s+(?:-s\s+)?build|npx\s+(?:--no-install\s+|--yes\s+)?next\s+build|next\s+build|yarn\s+build|pnpm\s+(?:run\s+)?build)\b(.*)$/i;

/** Detect foreground next/npm-dev and rewrite to a short detached start. */
function autoDetachLongServer(cmd) {
  const looksLikeServer =
    /(?:^|[;&|]\s*)(?:npm\s+run\s+dev|npm\s+start|npx\s+(?:--yes\s+)?next\s+dev|next\s+dev)\b/i.test(
      cmd,
    );
  if (!looksLikeServer) return null;
  // Already backgrounded (trailing & outside quotes) — leave alone but cap wait.
  if (/&\s*$/.test(cmd) || /&\s*(?:#.*)?$/.test(cmd)) {
    return `${cmd.replace(/&\s*$/, "").trim()} > /tmp/cander-dev.log 2>&1 & echo $!`;
  }
  return `( ${cmd} ) > /tmp/cander-dev.log 2>&1 & echo $!; sleep 1; tail -n 20 /tmp/cander-dev.log 2>/dev/null || true`;
}

export class SandboxTools {
  /**
   * @param {{ repoDir: string, devServerUrl: string, log: import("./events.mjs").EventLog, twentyFirst?: import("./twenty-first.mjs").TwentyFirstClient|null, preview?: import("./preview.mjs").PreviewSupervisor|null }} opts
   */
  constructor(opts) {
    this.repoDir = resolve(opts.repoDir);
    this.devServerUrl = opts.devServerUrl.replace(/\/$/, "");
    this.log = opts.log;
    this.twentyFirst = opts.twentyFirst ?? null;
    /** Owns dev-server reachability; null disables the health gate (tests). */
    this.preview = opts.preview ?? null;
    this.writtenPaths = new Set();
    this.toolCalls = 0;
    /** Cander provider tools (git/db/deploy) — server-side, job-token scoped. */
    this.provider = opts.provider ?? null;
  }

  // ---- path safety ---------------------------------------------------------

  safePath(input) {
    const raw = String(input ?? "").trim().replace(/^\.\//, "");
    if (!raw) throw new Error("path required");
    if (raw.startsWith("/") || raw.includes("\0")) {
      throw new Error(`path must be repo-relative: ${raw}`);
    }
    const abs = resolve(this.repoDir, raw);
    const rel = relative(this.repoDir, abs);
    if (!rel || rel.startsWith("..") || rel.split(sep)[0] === "..") {
      throw new Error(`path escapes repo: ${raw}`);
    }
    const top = rel.split(sep)[0];
    if (top === ".git" || top === ".cander" || top === "node_modules") {
      throw new Error(`path not allowed: ${raw}`);
    }
    return { abs, rel: rel.split(sep).join("/") };
  }

  // ---- schemas -------------------------------------------------------------

  definitions() {
    const defs = [
      {
        name: "list_tree",
        description:
          "List files in the project (repo-relative). Skips node_modules/.next/.git. Use before editing to learn the codebase.",
        parameters: {
          type: "object",
          properties: {
            dir: { type: "string", description: "Subdirectory to list; default repo root." },
            depth: { type: "integer", description: "Max depth (default 6)." },
          },
        },
      },
      {
        name: "read_file",
        description: "Read a text file. Optional 1-based line range.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            start_line: { type: "integer" },
            end_line: { type: "integer" },
          },
          required: ["path"],
        },
      },
      {
        name: "write_file",
        description:
          "Create or overwrite a text file with the full content. Creates parent directories.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
      {
        name: "edit_file",
        description:
          "Replace an exact string in an existing file. old_string must match exactly once unless replace_all is true. Prefer this over write_file for small changes.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            old_string: { type: "string" },
            new_string: { type: "string" },
            replace_all: { type: "boolean" },
          },
          required: ["path", "old_string", "new_string"],
        },
      },
      {
        name: "delete_file",
        description: "Delete a file or empty directory.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
      {
        name: "grep",
        description:
          "Search file contents with a regular expression. Returns path:line:text matches.",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string" },
            glob: {
              type: "string",
              description: "Optional filename filter, e.g. '*.tsx' or 'app/**'.",
            },
            max_results: { type: "integer" },
          },
          required: ["pattern"],
        },
      },
      {
        name: "run_command",
        description:
          "Run a shell command in the repo root (npm, npx, node, tsc, next, ls, cat, curl, git status/diff…). No git push/reset, no sudo. Output is truncated to ~20k chars.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string" },
            timeout_sec: { type: "integer", description: "Default 180, max 900." },
          },
          required: ["command"],
        },
      },
      {
        name: "check_preview",
        description:
          "Fetch routes on the running Next dev server and report HTTP status, page title, and any Next error overlay / compile error text. Call this after writing pages.",
        parameters: {
          type: "object",
          properties: {
            paths: {
              type: "array",
              items: { type: "string" },
              description: "Routes to check, e.g. ['/', '/about']. Default ['/'].",
            },
          },
        },
      },
      {
        name: "download_image",
        description:
          "Download an image (https URL, ≤8MB, png/jpg/webp/avif/svg/gif) into public/ so it ships with the site. Returns the public path to use in src. Prefer this over hot-linking for hero/section imagery.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string" },
            path: {
              type: "string",
              description: "Destination under public/, e.g. public/images/hero.jpg",
            },
          },
          required: ["url", "path"],
        },
      },
      {
        name: "inspect_page",
        description:
          "Open one route in a real browser and report console/runtime errors, the Next.js error overlay, horizontal overflow, landmarks, headings and unlabeled controls. Use when check_preview passes but something looks or behaves wrong, and for mobile checks (width 375).",
        parameters: {
          type: "object",
          properties: {
            route: { type: "string", description: "e.g. / or /pricing" },
            width: { type: "integer", description: "Viewport width in px (375 mobile, 768 tablet, 1280 desktop). Default 1280." },
          },
          required: ["route"],
        },
      },
      {
        name: "emit_progress",
        description:
          "Report a short, plain-English progress line for the user (no framework names, no npm/tsc/GitHub/Vercel). Call at each milestone.",
        parameters: {
          type: "object",
          properties: { message: { type: "string" } },
          required: ["message"],
        },
      },
      {
        name: "update_project_spec",
        description:
          "Record a LASTING decision in the project spec (cander.spec.json — the site's durable memory). Use for design-language changes (palette, typography, radius/shadow/density, buttons, cards, nav), new pages/features, brand assets, or standing user instructions. Not for one-off content edits. `patch` is merged into the spec (arrays replace; visual/brand merge); `decision` is a one-line log entry.",
        parameters: {
          type: "object",
          properties: {
            patch: {
              type: "object",
              description:
                "Partial spec. Keys: tagline, intent, audience, goals[], ctas[{label,href,primary}], pages[{path,title,purpose}], features[], tone, visual{direction,mood[],layout,palette{primary,accent,background,foreground,muted,...hex},typography{display,body,scale},components{radius,shadow,density,buttons,cards,nav}}, brand{logoPath,faviconPath,ogImagePath}, technical[], userInstructions[], constraints[].",
            },
            decision: { type: "string", description: "One sentence: what was decided and why." },
          },
          required: ["patch", "decision"],
        },
      },
      {
        name: "finish",
        description:
          "Call when the site is complete and verified. Provide a 1–3 sentence user-facing summary and the list of routes.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string" },
            routes: { type: "array", items: { type: "string" } },
          },
          required: ["summary"],
        },
      },
    ];
    if (this.provider) {
      defs.push(
        {
          name: "checkpoint",
          description:
            "Save a checkpoint of the current work to the user's draft (a commit). Call after a meaningful, verified chunk of work — e.g. after each page or feature passes tsc and check_preview — so progress is never lost.",
          parameters: {
            type: "object",
            properties: { message: { type: "string", description: "Short description of what was completed." } },
            required: ["message"],
          },
        },
        {
          name: "project_status",
          description: "Current project state from Cander (database connection, preview, live site, recent changes). Use when unsure whether a database or env var exists.",
          parameters: { type: "object", properties: {} },
        },
        {
          name: "db_schema",
          description: "Inspect the project's database: tables, columns, RLS state and policies. Call before writing queries or migrations.",
          parameters: { type: "object", properties: {} },
        },
        {
          name: "db_sql",
          description:
            "Run SQL against the development database. SELECT/EXPLAIN and row writes (INSERT/UPDATE/DELETE with a WHERE) are allowed. Schema changes are refused — use db_write_migration. Destructive statements (DROP/TRUNCATE) are refused and need the user.",
          parameters: {
            type: "object",
            properties: { sql: { type: "string" } },
            required: ["sql"],
          },
        },
        {
          name: "db_write_migration",
          description:
            "Create a versioned migration file under supabase/migrations/ and apply it to the development database. Every new table must enable row level security and define policies in the same migration. Seeds go in supabase/seed.sql, not migrations. Production receives the migration automatically at publish.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "short_snake_case_name" },
              sql: { type: "string", description: "Idempotent SQL (use if not exists / or replace)." },
            },
            required: ["name", "sql"],
          },
        },
        {
          name: "db_generate_types",
          description: "Regenerate lib/database.types.ts from the current database schema. Call after applying a migration so the app's types match.",
          parameters: { type: "object", properties: {} },
        },
        {
          name: "db_rls_check",
          description: "Audit row level security: every table must have RLS on with policies; flags public storage buckets. Run before finishing any database work.",
          parameters: { type: "object", properties: {} },
        },
      );
    }
    if (this.twentyFirst) {
      defs.push(
        {
          name: "search_components",
          description:
            "Search 21st.dev for production-quality React/Tailwind components (hero, pricing, testimonials, navbar, footer, features…). Returns ids + names + previews.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
              limit: { type: "integer", description: "1–5" },
            },
            required: ["query"],
          },
        },
        {
          name: "get_component",
          description:
            "Fetch a 21st.dev component's source code and dependencies by id. Adapt it into components/ and install any listed packages.",
          parameters: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
        },
      );
    }
    return defs.map((d) => ({ type: "function", strict: false, ...d }));
  }

  // ---- dispatch ------------------------------------------------------------

  /**
   * @returns {Promise<{ output: string, finished?: { summary: string, routes: string[] } }>}
   */
  async call(name, args) {
    this.toolCalls += 1;
    const a = args && typeof args === "object" ? args : {};
    const startedAt = Date.now();
    const result = await this.dispatch(name, a);
    // Redacted run ledger entry: tool, paths, a short summary. Never file
    // bodies, outputs or anything that could carry a secret.
    try {
      const out = String(result?.output ?? "");
      this.log.emit("tool_call", name, {
        tool: name,
        ok: !/^(ERROR|REFUSED)\b/.test(out),
        durationMs: Date.now() - startedAt,
        paths: toolCallPaths(a),
        summary: toolCallSummary(name, a),
      });
    } catch {
      /* ledger is best-effort */
    }
    return result;
  }

  async dispatch(name, a) {
    try {
      switch (name) {
        case "list_tree":
          return { output: this.listTree(a.dir, a.depth) };
        case "read_file":
          return { output: this.readFile(a.path, a.start_line, a.end_line) };
        case "write_file":
          return { output: this.writeFile(a.path, a.content) };
        case "edit_file":
          return {
            output: this.editFile(a.path, a.old_string, a.new_string, a.replace_all),
          };
        case "delete_file":
          return { output: this.deleteFile(a.path) };
        case "grep":
          return { output: this.grep(a.pattern, a.glob, a.max_results) };
        case "run_command":
          return { output: await this.runCommand(a.command, a.timeout_sec) };
        case "check_preview":
          return { output: await this.checkPreview(a.paths) };
        case "download_image":
          return { output: await this.downloadImage(a.url, a.path) };
        case "inspect_page": {
          const { inspectPage } = await import("./functional.mjs");
          return { output: await inspectPage({ devServerUrl: this.devServerUrl, route: a.route, width: a.width, log: this.log }) };
        }
        case "emit_progress":
          this.log.emit("progress", String(a.message ?? "").slice(0, 200));
          return { output: "ok" };
        case "update_project_spec":
          return { output: this.updateProjectSpec(a.patch, a.decision) };
        case "checkpoint":
          return { output: await this.providerTool("git.checkpoint", { message: String(a.message ?? "") }) };
        case "project_status":
          return { output: await this.providerTool("project.status", {}) };
        case "db_schema":
          return { output: await this.providerTool("db.schema", {}) };
        case "db_sql":
          return { output: await this.providerTool("db.sql", { sql: String(a.sql ?? "") }) };
        case "db_write_migration":
          return { output: await this.writeMigration(a.name, a.sql) };
        case "db_generate_types": {
          const out = await this.providerTool("db.types", {});
          if (out.startsWith("ERROR") || out.startsWith("REFUSED") || !/export\s+type\s+Database/.test(out)) return { output: out };
          this.writeFile("lib/database.types.ts", out.endsWith("\n") ? out : `${out}\n`);
          return { output: "Wrote lib/database.types.ts from the current schema." };
        }
        case "db_rls_check":
          return { output: await this.providerTool("db.rls_check", {}) };
        case "search_components":
          return { output: await this.searchComponents(a.query, a.limit) };
        case "get_component":
          return { output: await this.getComponent(a.id) };
        case "finish":
          return {
            output: "finish acknowledged",
            finished: {
              summary: String(a.summary ?? "").slice(0, 2000),
              routes: Array.isArray(a.routes) ? a.routes.map(String) : [],
            },
          };
        default:
          return { output: `Unknown tool: ${name}` };
      }
    } catch (err) {
      return { output: `ERROR: ${err?.message || String(err)}` };
    }
  }

  // ---- implementations ------------------------------------------------------

  /**
   * Merge a patch into cander.spec.json locally (so read_file sees it) and
   * emit a spec_update event; the server merges it into projects.project_spec
   * and re-renders DESIGN.md before the draft is committed.
   */
  updateProjectSpec(patch, decision) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return "ERROR: patch must be an object";
    }
    const specPath = join(this.repoDir, "cander.spec.json");
    let current = {};
    try {
      if (existsSync(specPath)) current = JSON.parse(readFileSync(specPath, "utf8")) || {};
    } catch {
      current = {};
    }
    const next = { ...current };
    for (const [k, v] of Object.entries(patch)) {
      if (k === "version" || k === "kind" || k === "decisions" || v === undefined) continue;
      if ((k === "visual" || k === "brand") && v && typeof v === "object" && !Array.isArray(v)) {
        const prev = current[k] && typeof current[k] === "object" ? current[k] : {};
        const merged = { ...prev };
        for (const [sk, sv] of Object.entries(v)) {
          merged[sk] =
            sv && typeof sv === "object" && !Array.isArray(sv)
              ? { ...(prev[sk] && typeof prev[sk] === "object" ? prev[sk] : {}), ...sv }
              : sv;
        }
        next[k] = merged;
      } else if (["userInstructions", "technical", "features"].includes(k)) {
        const prev = Array.isArray(current[k]) ? current[k] : [];
        const add = Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [];
        next[k] = [...new Set([...prev, ...add.map((x) => x.trim()).filter(Boolean)])].slice(0, 40);
      } else {
        next[k] = v;
      }
    }
    const now = new Date().toISOString();
    const summary = String(decision ?? "").trim().slice(0, 300);
    next.decisions = [
      ...(Array.isArray(current.decisions) ? current.decisions : []),
      ...(summary ? [{ at: now, summary, source: "builder" }] : []),
    ].slice(-60);
    next.updatedAt = now;
    mkdirSync(dirname(specPath), { recursive: true });
    writeFileSync(specPath, `${JSON.stringify(next, null, 2)}\n`);
    this.writtenPaths.add("cander.spec.json");
    this.log.emit("spec_update", summary || "Project spec updated", { patch, decision: summary });
    return "ok — spec updated (cander.spec.json). DESIGN.md is regenerated when the draft is saved.";
  }

  listTree(dir, depth) {
    const root = dir ? this.safePath(dir).abs : this.repoDir;
    const maxDepth = Math.min(Math.max(Number(depth) || 6, 1), 12);
    const lines = [];
    const walk = (abs, d) => {
      if (lines.length >= 600) return;
      let entries;
      try {
        entries = readdirSync(abs, { withFileTypes: true });
      } catch {
        return;
      }
      entries.sort((x, y) => x.name.localeCompare(y.name));
      for (const e of entries) {
        if (IGNORED_DIRS.has(e.name)) continue;
        const child = join(abs, e.name);
        const rel = relative(this.repoDir, child).split(sep).join("/");
        if (e.isDirectory()) {
          lines.push(`${rel}/`);
          if (d < maxDepth) walk(child, d + 1);
        } else {
          let size = 0;
          try {
            size = statSync(child).size;
          } catch {
            /* ignore */
          }
          lines.push(`${rel} (${size}b)`);
        }
        if (lines.length >= 600) {
          lines.push("… (truncated)");
          return;
        }
      }
    };
    walk(root, 1);
    return lines.join("\n") || "(empty)";
  }

  readFile(path, startLine, endLine) {
    const { abs, rel } = this.safePath(path);
    if (!existsSync(abs)) return `ERROR: ${rel} does not exist`;
    if (BINARY_RE.test(rel)) return `(binary file ${rel}, ${statSync(abs).size} bytes)`;
    const text = readFileSync(abs, "utf8");
    const lines = text.split("\n");
    const s = Math.max(1, Number(startLine) || 1);
    const e = Math.min(lines.length, Number(endLine) || lines.length);
    const slice = lines.slice(s - 1, e);
    const numbered = slice.map((l, i) => `${String(s + i).padStart(4)}| ${l}`);
    const body = numbered.join("\n");
    return body.length > 60_000
      ? `${body.slice(0, 60_000)}\n… (truncated; read a smaller range)`
      : body;
  }

  writeFile(path, content) {
    const { abs, rel } = this.safePath(path);
    if (typeof content !== "string") throw new Error("content must be a string");
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
    this.writtenPaths.add(rel);
    this.log.emit("file", `Wrote ${rel}`, { path: rel, bytes: content.length });
    return `Wrote ${rel} (${content.length} chars)`;
  }

  editFile(path, oldString, newString, replaceAll) {
    const { abs, rel } = this.safePath(path);
    if (!existsSync(abs)) throw new Error(`${rel} does not exist — use write_file`);
    if (typeof oldString !== "string" || !oldString.length) {
      throw new Error("old_string required");
    }
    const text = readFileSync(abs, "utf8");
    const count = text.split(oldString).length - 1;
    if (count === 0) {
      throw new Error(`old_string not found in ${rel}. Read the file and retry with an exact match.`);
    }
    if (count > 1 && !replaceAll) {
      throw new Error(
        `old_string matches ${count} times in ${rel}; include more context or set replace_all.`,
      );
    }
    const next = replaceAll
      ? text.split(oldString).join(String(newString ?? ""))
      : text.replace(oldString, () => String(newString ?? ""));
    writeFileSync(abs, next, "utf8");
    this.writtenPaths.add(rel);
    this.log.emit("file", `Edited ${rel}`, { path: rel, replacements: count });
    return `Edited ${rel} (${replaceAll ? count : 1} replacement${count === 1 ? "" : "s"})`;
  }

  deleteFile(path) {
    const { abs, rel } = this.safePath(path);
    if (!existsSync(abs)) return `${rel} already absent`;
    rmSync(abs, { recursive: false, force: false });
    this.writtenPaths.add(rel);
    this.log.emit("file", `Deleted ${rel}`, { path: rel, deleted: true });
    return `Deleted ${rel}`;
  }

  grep(pattern, glob, maxResults) {
    if (!pattern) throw new Error("pattern required");
    const re = new RegExp(pattern, "i");
    const max = Math.min(Math.max(Number(maxResults) || 60, 1), 300);
    const globRe = glob ? globToRegExp(glob) : null;
    const hits = [];
    const walk = (abs) => {
      if (hits.length >= max) return;
      let entries;
      try {
        entries = readdirSync(abs, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (IGNORED_DIRS.has(e.name)) continue;
        const child = join(abs, e.name);
        const rel = relative(this.repoDir, child).split(sep).join("/");
        if (e.isDirectory()) {
          walk(child);
          continue;
        }
        if (BINARY_RE.test(rel)) continue;
        if (globRe && !globRe.test(rel) && !globRe.test(e.name)) continue;
        let text;
        try {
          if (statSync(child).size > 1_500_000) continue;
          text = readFileSync(child, "utf8");
        } catch {
          continue;
        }
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            hits.push(`${rel}:${i + 1}:${lines[i].trim().slice(0, 240)}`);
            if (hits.length >= max) return;
          }
        }
      }
    };
    walk(this.repoDir);
    return hits.length ? hits.join("\n") : "(no matches)";
  }

  /**
   * Write supabase/migrations/<version>_<name>.sql and apply it to the
   * development database through Cander (which owns the credentials).
   */
  async writeMigration(name, sql) {
    const slug = String(name ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
    const body = String(sql ?? "").trim();
    if (!slug) return "ERROR: name is required.";
    if (!body) return "ERROR: sql is required.";
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
    const version = `${stamp}_${slug}`;
    const rel = `supabase/migrations/${version}.sql`;
    this.writeFile(rel, `${body}\n`);
    const out = await this.providerTool("db.migration", { version, name: slug, filePath: rel, sql: body });
    return `${rel} written.\n${out}`;
  }

  /**
   * Call a Cander provider tool. Credentials and ids stay on the server; the
   * sandbox only presents its job token.
   * @param {string} name e.g. "git.checkpoint"
   * @param {Record<string, unknown>} args
   */
  async providerTool(name, args) {
    if (!this.provider) return "ERROR: provider tools are not available in this run";
    const { apiBase, jobId, token } = this.provider;
    try {
      const res = await fetch(`${apiBase}/api/build-jobs/${encodeURIComponent(jobId)}/tools/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(args ?? {}),
        signal: AbortSignal.timeout(4 * 60_000),
      });
      const json = await res.json().catch(() => ({}));
      const output = typeof json?.output === "string" ? json.output : `HTTP ${res.status}`;
      return res.ok ? output : `ERROR: ${output}`;
    } catch (err) {
      return `ERROR: ${name} failed: ${String(err?.message || err).slice(0, 200)}`;
    }
  }

  async runCommand(command, timeoutSec) {
    let cmd = String(command ?? "").trim();
    if (!cmd) throw new Error("command required");
    if (BLOCKED_COMMAND_RE.test(cmd)) {
      throw new Error("command blocked by policy");
    }
    // Every segment of a pipeline / && chain must start with an allowed binary.
    const segments = cmd.split(/\s*(?:&&|\|\||\||;)\s*/).filter(Boolean);
    for (const seg of segments) {
      const s = seg.replace(/^\s*(?:[A-Z_][A-Z0-9_]*=\S+\s+)*/, "");
      if (!ALLOWED_COMMAND_PREFIX_RE.test(s)) {
        throw new Error(`command not allowed: ${seg.slice(0, 80)}`);
      }
    }
    // Long-lived servers hang the agent if run in the foreground. Do NOT start
    // next/npm-dev here — PreviewSupervisor owns the preview process. Redirect.
    if (/(?:^|[;&|]\s*)(?:npm\s+run\s+dev|npm\s+start|npx\s+(?:--yes\s+)?next\s+dev|next\s+dev)\b/i.test(cmd)) {
      this.log.emit("tool", `$ ${cmd.slice(0, 160)}`, { command: cmd.slice(0, 500), blocked: "preview_owner" });
      return [
        "REFUSED: Do not start or restart the preview server.",
        "Cander's PreviewSupervisor owns next dev. Use check_preview instead — it recovers the server when needed.",
      ].join(" ");
    }
    const timeoutMs = Math.min(Math.max(Number(timeoutSec) || 180, 5), 900) * 1000;
    // A production build in the live repo dir fights the dev server over
    // `.next` (flaky prerender crashes, preview restarts). Run it in the same
    // isolated mirror acceptance uses so the coder sees what Vercel will see.
    const buildMatch = segments.length === 1 ? PRODUCTION_BUILD_CMD_RE.exec(cmd) : null;
    if (buildMatch) {
      const flags = ((buildMatch[1] || "").match(/--(?:webpack|debug|turbopack)\b/g) || []).join(" ");
      const buildCmd = `npx --no-install next build${flags ? ` ${flags}` : ""}`;
      this.log.emit("tool", `$ ${cmd.slice(0, 160)}`, { command: cmd.slice(0, 500), isolated: true });
      const result = await execShell(isolatedBuildScript(this.repoDir, buildCmd), {
        cwd: this.repoDir,
        timeoutMs: Math.max(timeoutMs, 420_000),
      });
      const out = [
        result.stdout,
        result.stderr ? `\n[stderr]\n${result.stderr}` : "",
        "\n[production build ran in an isolated copy of the repo so it does not disturb the preview server — same sources, same node_modules]",
        `\n[exit ${result.exitCode}${result.timedOut ? ", timed out" : ""}]`,
      ].join("");
      return truncate(out, 20_000);
    }
    this.log.emit("tool", `$ ${cmd.slice(0, 160)}`, { command: cmd.slice(0, 500) });
    const result = await execShell(cmd, { cwd: this.repoDir, timeoutMs });
    const out = [
      result.stdout,
      result.stderr ? `\n[stderr]\n${result.stderr}` : "",
      `\n[exit ${result.exitCode}${result.timedOut ? ", timed out" : ""}]`,
    ].join("");
    return truncate(out, 20_000);
  }

  async checkPreview(paths) {
    const routes =
      Array.isArray(paths) && paths.length
        ? paths.map((p) => String(p || "/")).slice(0, 25)
        : ["/"];
    // Health gate: a dead server is one infrastructure problem, not N route
    // bugs. Recover it here (bounded) instead of reporting HTTP 0 per route.
    if (this.preview) {
      const health = await this.preview.ensure({ reason: "check_preview" });
      if (!health.ok) {
        this.log.emit("verify", `Preview check skipped: server unreachable (${health.cause})`, {
          unreachable: true,
          cause: health.cause,
          kind: health.kind,
        });
        return this.preview.agentMessage(health);
      }
    }
    const results = [];
    for (const route of routes) {
      const path = route.startsWith("/") ? route : `/${route}`;
      const r = await fetchPreview(`${this.devServerUrl}${path}`);
      results.push(r);
    }
    this.log.emit(
      "verify",
      `Preview check: ${results.map((r) => `${r.path} ${r.status}`).join(", ")}`,
      { results: results.map((r) => ({ path: r.path, status: r.status, ok: r.ok })) },
    );
    // Every route failed to connect mid-check → the server died while we were
    // fetching. Say so once instead of listing per-route "HTTP 0".
    if (results.length && results.every((r) => r.status === 0) && this.preview) {
      const health = await this.preview.ensure({ reason: "check_preview_all_zero" });
      if (!health.ok) return this.preview.agentMessage(health);
      return "The preview server restarted during the check. Call check_preview again for these routes.";
    }
    return results
      .map((r) => {
        const head = `${r.path} → HTTP ${r.status}${r.ok ? "" : " (PROBLEM)"} title=${JSON.stringify(r.title)}`;
        return r.error ? `${head}\n  error: ${r.error}` : head;
      })
      .join("\n");
  }

  async downloadImage(url, path) {
    const u = String(url ?? "").trim();
    if (!/^https:\/\//i.test(u)) throw new Error("url must be https");
    // Reject known-ephemeral / auth-gated hosts that break at publish time.
    if (
      /oaidalleapiprodscus|blob\.core\.windows\.net|replicate\.delivery|openai\.com\/.*\/files|X-Amz-Signature|Expires=\d{10}/i.test(
        u,
      )
    ) {
      throw new Error(
        "Refusing ephemeral/auth image URL — download a durable Unsplash/static asset into public/assets/ instead, or use an intentional placeholder.",
      );
    }
    let relPath = String(path ?? "").trim();
    // Prefer durable public/assets/* for marketing imagery.
    if (relPath.startsWith("public/images/")) {
      relPath = relPath.replace(/^public\/images\//, "public/assets/");
    }
    if (!relPath.startsWith("public/")) throw new Error("path must be under public/");
    const { abs, rel } = this.safePath(relPath);
    if (!BINARY_RE.test(rel) && !/\.svg$/i.test(rel)) {
      throw new Error("path must end with an image extension");
    }
    this.log.emit("progress", "Preparing imagery…", { phase: "imagery" });
    const res = await fetch(u, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: "image/*", "User-Agent": "cander-builder/1.0" },
    });
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    const type = res.headers.get("content-type") || "";
    if (!/^image\//i.test(type)) throw new Error(`not an image (content-type ${type || "unknown"})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) throw new Error("image larger than 8MB");
    if (buf.length < 64) throw new Error("image is empty");
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, buf);
    this.writtenPaths.add(rel);
    this.log.emit("file", `Downloaded ${rel}`, { path: rel, bytes: buf.length, type });
    return `Saved ${rel} (${Math.round(buf.length / 1024)} KB, ${type}). Use src="/${rel.slice("public/".length)}".`;
  }

  async searchComponents(query, limit) {
    if (!this.twentyFirst) return "21st.dev is not configured for this job.";
    const hits = await this.twentyFirst.search(String(query ?? ""), limit);
    if (!hits.length) return "(no components found)";
    return hits
      .map(
        (h) =>
          `- id=${h.id} name=${JSON.stringify(h.name)}${h.category ? ` category=${h.category}` : ""}${h.description ? `\n  ${h.description.slice(0, 200)}` : ""}`,
      )
      .join("\n");
  }

  async getComponent(id) {
    if (!this.twentyFirst) return "21st.dev is not configured for this job.";
    const c = await this.twentyFirst.get(String(id ?? ""));
    if (!c) return `Component ${id} not found.`;
    const deps = c.dependencies?.length ? `\nnpm dependencies: ${c.dependencies.join(", ")}` : "";
    return `// 21st: ${c.id} — ${c.name}${deps}\n\n${truncate(c.code || "", 40_000)}`;
  }
}

// ---- helpers ------------------------------------------------------------------

export async function fetchPreview(url, timeoutMs = 45_000) {
  const path = (() => {
    try {
      return new URL(url).pathname || "/";
    } catch {
      return url;
    }
  })();
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "text/html" },
    });
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim();
    const error = detectNextError(html);
    const ok = res.status >= 200 && res.status < 400 && !error;
    return {
      path,
      status: res.status,
      ok,
      title,
      error,
      bytes: html.length,
      html: html.slice(0, 400_000),
    };
  } catch (err) {
    return {
      path,
      status: 0,
      ok: false,
      title: "",
      error: `fetch failed: ${err?.message || String(err)}`,
      bytes: 0,
      html: "",
    };
  }
}

function detectNextError(html) {
  if (!html) return null;
  const patterns = [
    /Module not found[^<]{0,300}/i,
    /Unhandled Runtime Error[^<]{0,300}/i,
    /Failed to compile[^<]{0,300}/i,
    /Syntax ?Error[^<]{0,300}/i,
    /Type ?Error:[^<]{0,300}/i,
    /Error: [^<]{0,300}/,
    /Internal Server Error/i,
    /This page could not be found/i,
    /Application error: a client-side exception/i,
  ];
  const isErrorPage =
    /__next_error__/i.test(html) || /nextjs-portal|nextjs__container_errors/i.test(html);
  for (const p of patterns) {
    const m = html.match(p);
    if (m && (isErrorPage || /Module not found|Failed to compile|could not be found|Internal Server Error/i.test(m[0]))) {
      return decodeEntities(m[0]).slice(0, 300);
    }
  }
  return null;
}

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function execShell(command, opts) {
  return new Promise((resolvePromise) => {
    const child = spawn("bash", ["-lc", command], {
      cwd: opts.cwd,
      env: { ...process.env, CI: "1", FORCE_COLOR: "0", NEXT_TELEMETRY_DISABLED: "1", ...(opts.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, opts.timeoutMs);
    child.stdout.on("data", (d) => {
      if (stdout.length < 200_000) stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      if (stderr.length < 100_000) stderr += d.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ stdout, stderr, exitCode: code ?? (timedOut ? 124 : 1), timedOut });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({ stdout, stderr: `${stderr}\n${err.message}`, exitCode: 1, timedOut });
    });
  });
}

export function truncate(s, max) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  const head = str.slice(0, Math.floor(max * 0.7));
  const tail = str.slice(-Math.floor(max * 0.25));
  return `${head}\n… (${str.length - max} chars omitted) …\n${tail}`;
}

function globToRegExp(glob) {
  const esc = String(glob)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  return new RegExp(`^${esc}$`);
}

/** Paths a tool call touched, for the redacted run ledger. */
function toolCallPaths(a) {
  const out = [];
  for (const key of ["path", "dir", "file"]) if (typeof a?.[key] === "string") out.push(a[key]);
  if (Array.isArray(a?.paths)) for (const p of a.paths) if (typeof p === "string") out.push(p);
  if (Array.isArray(a?.files)) for (const f of a.files) if (typeof f?.path === "string") out.push(f.path);
  return out.slice(0, 20);
}

/** One safe line describing the call: commands with token-like values masked, queries elided. */
function toolCallSummary(name, a) {
  if (name === "run_command" && typeof a?.command === "string") {
    return a.command.replace(/([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_]*=)\S+/gi, "$1[redacted]").slice(0, 200);
  }
  if (name === "db_sql" && typeof a?.sql === "string") return a.sql.trim().split(/\s+/).slice(0, 3).join(" ").toUpperCase().slice(0, 40);
  if (name === "db_write_migration" && typeof a?.name === "string") return `migration ${a.name}`.slice(0, 120);
  if ((name === "search_files" || name === "search_components") && typeof a?.query === "string") return a.query.slice(0, 120);
  if (name === "emit_progress" && typeof a?.message === "string") return a.message.slice(0, 120);
  if (name === "checkpoint" && typeof a?.message === "string") return a.message.slice(0, 120);
  return null;
}
