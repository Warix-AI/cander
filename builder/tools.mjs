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
        case "emit_progress":
          this.log.emit("progress", String(a.message ?? "").slice(0, 200));
          return { output: "ok" };
        case "update_project_spec":
          return { output: this.updateProjectSpec(a.patch, a.decision) };
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
    // Long-lived servers hang the agent if run in the foreground. Detach them
    // automatically and return immediately so the coder can keep working.
    const detached = autoDetachLongServer(cmd);
    if (detached) {
      cmd = detached;
      this.log.emit("tool", `$ ${cmd.slice(0, 160)}`, { command: cmd.slice(0, 500), detached: true });
      const result = await execShell(cmd, { cwd: this.repoDir, timeoutMs: 15_000 });
      const out = [
        result.stdout,
        result.stderr ? `\n[stderr]\n${result.stderr}` : "",
        "\n[started in background — use check_preview; do not start the preview server again]",
        `\n[exit ${result.exitCode}${result.timedOut ? ", timed out" : ""}]`,
      ].join("");
      return truncate(out, 20_000);
    }
    const timeoutMs = Math.min(Math.max(Number(timeoutSec) || 180, 5), 900) * 1000;
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
    const { abs, rel } = this.safePath(path);
    if (!rel.startsWith("public/")) throw new Error("path must be under public/");
    if (!BINARY_RE.test(rel) && !/\.svg$/i.test(rel)) {
      throw new Error("path must end with an image extension");
    }
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
