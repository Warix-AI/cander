/**
 * Build tool executors — semantic tools wrap store / recipes / components.
 * computer.* tools hit the project sandbox via authenticated APIs (Phase 3).
 */

import type { AiToolCallResult } from "../runtime/tools.ts";
import { compileBuildSpecSlice } from "./build-spec.ts";
import { loadBuildSpec } from "./store.ts";
import { searchComponentsBounded } from "./component-provider.ts";
import { getBuildRecipe } from "./recipes.ts";
import {
  getTurnProjectId,
  getTurnWorkspaceId,
} from "../runtime/turn-context.ts";
import { isSandboxEnabled } from "../intelligence/flags.ts";

async function authHeaders(): Promise<HeadersInit> {
  try {
    const { createSupabaseBrowserClient } = await import(
      "@/lib/supabase/client"
    );
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    /* server / no session */
  }
  return {};
}

async function sandboxFilesApi(opts: {
  projectId: string;
  workspaceId: string;
  body: Record<string, unknown>;
}): Promise<{ ok: boolean; output: string; data?: Record<string, unknown> }> {
  const headers = await authHeaders();
  const res = await fetch(
    `/api/projects/${encodeURIComponent(opts.projectId)}/sandbox/files`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        workspaceId: opts.workspaceId,
        ...opts.body,
      }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      output: String(data.error ?? `sandbox files failed (${res.status})`),
    };
  }
  return { ok: true, output: "ok", data };
}

export async function executeBuildTool(opts: {
  name: string;
  args: Record<string, unknown>;
}): Promise<AiToolCallResult | null> {
  const { name, args } = opts;
  if (
    !name.startsWith("build.") &&
    !name.startsWith("computer.files") &&
    name !== "computer.exec" &&
    name !== "computer.port.expose"
  ) {
    return null;
  }

  const projectId =
    String(args.projectId ?? getTurnProjectId() ?? "").trim() || null;
  const workspaceId =
    String(args.workspaceId ?? getTurnWorkspaceId() ?? "").trim() || null;

  if (name === "build.spec.read") {
    if (!projectId) {
      return { name, ok: false, output: "projectId required" };
    }
    const spec = loadBuildSpec(projectId);
    if (!spec) {
      return { name, ok: false, output: "no BuildSpec for project" };
    }
    return {
      name,
      ok: true,
      output: compileBuildSpecSlice(spec),
      data: { version: spec.buildSpecVersion },
    };
  }

  if (name === "build.component.search") {
    const query = String(args.query ?? args.role ?? "").trim();
    const candidates = await searchComponentsBounded({
      query,
      role: args.role ? String(args.role) : undefined,
    });
    return {
      name,
      ok: true,
      output: JSON.stringify(candidates),
      data: { candidates },
    };
  }

  if (name === "build.recipe.apply") {
    const recipeId = String(args.recipeId ?? "");
    const recipe = getBuildRecipe(recipeId);
    if (!recipe) {
      return { name, ok: false, output: `unknown recipe: ${recipeId}` };
    }
    // Auth/backend recipes: lazily provision Warix Supabase + inject sandbox env.
    if (
      recipe.backend?.some((b) => /auth|rls|profiles/i.test(b)) &&
      projectId &&
      workspaceId
    ) {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/supabase`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ workspaceId, injectSandbox: true }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      return {
        name,
        ok: res.ok && data.ok !== false,
        output:
          data.status === "ready"
            ? `recipe ${recipe.recipeId}@${recipe.recipeVersion} ready; Supabase ${String(data.projectRef ?? "")} provisioned`
            : data.status === "skipped"
              ? `recipe ${recipe.recipeId}@${recipe.recipeVersion} ready; Supabase provisioning skipped (not configured)`
              : String(
                  data.message ??
                    data.error ??
                    `recipe ready; supabase status=${String(data.status)}`,
                ),
        data: { recipe, supabase: data },
      };
    }
    return {
      name,
      ok: true,
      output: `recipe ${recipe.recipeId}@${recipe.recipeVersion} ready`,
      data: { recipe },
    };
  }

  if (name === "build.auth.configure") {
    if (!projectId || !workspaceId) {
      return {
        name,
        ok: false,
        output: "projectId and workspaceId required for auth configure",
      };
    }
    const headers = await authHeaders();
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/supabase`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ workspaceId, injectSandbox: true }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      name,
      ok: res.ok && (data.ok !== false || data.status === "skipped"),
      output:
        data.status === "ready"
          ? `Auth backend ready (Supabase ${String(data.projectRef ?? "project")}).`
          : data.status === "skipped"
            ? "Auth configure skipped — Supabase Management API not configured on this server."
            : String(data.message ?? data.error ?? "Auth configure failed."),
      data,
    };
  }

  if (name === "build.validate") {
    return {
      name,
      ok: true,
      output: "validation queued — runtime owns completion criteria",
    };
  }

  if (name === "build.publish") {
    return {
      name,
      ok: true,
      output:
        "Publish requires Validated Draft + user confirmation. Use request_publish_approval.",
      pauseForUser: true,
    };
  }

  if (
    name.startsWith("computer.files") ||
    name === "computer.exec" ||
    name === "computer.port.expose"
  ) {
    if (!isSandboxEnabled()) {
      return {
        name,
        ok: false,
        output:
          "Sandbox tools are disabled. Enable CANDER_BUILD_SANDBOX (or intelligence sandbox flag).",
      };
    }
    if (!projectId || !workspaceId) {
      return {
        name,
        ok: false,
        output: "projectId and workspaceId required for sandbox tools",
      };
    }

    if (name === "computer.files.write" || name === "computer.files.patch") {
      const path = String(args.path ?? "").trim();
      const content = String(args.content ?? args.patch ?? "");
      if (!path) return { name, ok: false, output: "path required" };
      const result = await sandboxFilesApi({
        projectId,
        workspaceId,
        body: {
          action: "write",
          path,
          content,
          persist: args.persist !== false,
        },
      });
      return {
        name,
        ok: result.ok,
        output: result.ok
          ? `Wrote ${path}${result.data?.draftSha ? ` → draft ${String(result.data.draftSha).slice(0, 7)}` : ""}`
          : result.output,
        data: result.data,
      };
    }

    if (name === "computer.files.read") {
      const path = String(args.path ?? "").trim();
      if (!path) return { name, ok: false, output: "path required" };
      const result = await sandboxFilesApi({
        projectId,
        workspaceId,
        body: { action: "read", path },
      });
      return {
        name,
        ok: result.ok,
        output: result.ok
          ? String(result.data?.content ?? "")
          : result.output,
        data: result.data,
      };
    }

    if (name === "computer.files.list") {
      const result = await sandboxFilesApi({
        projectId,
        workspaceId,
        body: { action: "list", path: args.path },
      });
      return {
        name,
        ok: result.ok,
        output: result.ok
          ? JSON.stringify(result.data?.entries ?? [])
          : result.output,
        data: result.data,
      };
    }

    if (name === "computer.exec") {
      const command = String(args.command ?? args.cmd ?? "").trim();
      if (!command) return { name, ok: false, output: "command required" };
      const rawArgs = args.args;
      const execArgs = Array.isArray(rawArgs)
        ? rawArgs.map((a) => String(a))
        : [];
      const result = await sandboxFilesApi({
        projectId,
        workspaceId,
        body: { action: "exec", command, args: execArgs },
      });
      return {
        name,
        ok: result.ok,
        output: result.ok
          ? String(result.data?.stdout ?? "")
          : result.output,
        data: result.data,
      };
    }

    if (name === "computer.port.expose") {
      return {
        name,
        ok: true,
        output:
          "Port exposure is managed by the build sandbox (port 3000). Live preview routing lands in a later phase.",
      };
    }

    return {
      name,
      ok: false,
      output: `Unsupported sandbox tool: ${name}`,
    };
  }

  return {
    name,
    ok: true,
    output: `${name} acknowledged — applied via Build TurnPlan runtime when gated`,
    data: args,
  };
}
