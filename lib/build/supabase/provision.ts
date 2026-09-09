/**
 * Warix-managed per-app Supabase provisioning (Management API).
 * Server-only. Never return service-role keys to the browser.
 */

import { randomBytes } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getSupabaseManagementConfig,
  isSupabaseManagementConfigured,
} from "@/lib/build/config";
import { supabaseManagementFetch } from "@/lib/build/supabase/management";

export type AppSupabaseStatus =
  | "idle"
  | "pending"
  | "ready"
  | "error"
  | "skipped";

export type EnsureAppSupabaseResult = {
  status: AppSupabaseStatus;
  projectRef: string | null;
  url: string | null;
  created: boolean;
  message?: string;
  /** Present only in-process for sandbox inject — never serialize to clients. */
  secrets?: {
    anonKey: string;
    serviceRoleKey: string | null;
  };
};

function trim(v: string | undefined | null): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function projectNameFor(projectId: string, title: string): string {
  const short = projectId.replace(/-/g, "").slice(0, 10);
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `cander-${base || "app"}-${short}`.slice(0, 40);
}

function supabaseUrlForRef(ref: string): string {
  return `https://${ref}.supabase.co`;
}

function generateDbPassword(): string {
  return `Cd$${randomBytes(24).toString("base64url")}`;
}

type ApiKeyRow = {
  name?: string;
  api_key?: string;
  type?: string;
};

async function fetchProjectApiKeys(ref: string): Promise<{
  anonKey: string | null;
  serviceRoleKey: string | null;
}> {
  const res = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(ref)}/api-keys?reveal=true`,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch API keys (${res.status}): ${text}`);
  }
  const keys = (await res.json()) as ApiKeyRow[];
  let anonKey: string | null = null;
  let serviceRoleKey: string | null = null;
  for (const key of keys) {
    const name = (key.name ?? "").toLowerCase();
    const type = (key.type ?? "").toLowerCase();
    const value = key.api_key?.trim() || null;
    if (!value) continue;
    if (
      name === "anon" ||
      name === "anonymous" ||
      name.includes("anon") ||
      (type === "legacy" && name.includes("anon"))
    ) {
      anonKey = anonKey ?? value;
    }
    if (
      name === "service_role" ||
      name.includes("service_role") ||
      name.includes("service") ||
      type === "secret"
    ) {
      serviceRoleKey = serviceRoleKey ?? value;
    }
  }
  // Fallback: first legacy pair often ordered anon then service_role
  if (!anonKey && keys[0]?.api_key) anonKey = keys[0].api_key;
  if (!serviceRoleKey && keys[1]?.api_key) serviceRoleKey = keys[1].api_key;
  return { anonKey, serviceRoleKey };
}

async function waitForProjectActive(
  ref: string,
  attempts = 20,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const res = await supabaseManagementFetch(
      `/v1/projects/${encodeURIComponent(ref)}`,
    );
    if (res.ok) {
      const data = (await res.json()) as { status?: string };
      const status = (data.status ?? "").toUpperCase();
      if (status === "ACTIVE_HEALTHY" || status === "ACTIVE") return;
      if (status === "INACTIVE" || status === "REMOVED") {
        throw new Error(`Supabase project ended in status ${status}`);
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  // Continue anyway — keys may still work while provisioning finishes.
}

export async function loadAppSupabaseBinding(
  projectId: string,
  workspaceId: string,
): Promise<{
  ref: string | null;
  status: AppSupabaseStatus;
  title: string;
  kind: string | null;
} | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select("title, supabase_project_ref, supabase_status, kind")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    title: String(data.title ?? "App"),
    ref: data.supabase_project_ref ? String(data.supabase_project_ref) : null,
    status: (data.supabase_status as AppSupabaseStatus) || "idle",
    kind: data.kind ? String(data.kind) : null,
  };
}

async function patchBinding(
  projectId: string,
  workspaceId: string,
  patch: { supabase_project_ref?: string | null; supabase_status?: string },
) {
  const admin = createSupabaseAdminClient();
  await admin
    .from("projects")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("workspace_id", workspaceId);
}

/**
 * Lazy-ensure a Warix-org Supabase project for this Cander app/site.
 */
export async function ensureAppSupabaseProject(opts: {
  projectId: string;
  workspaceId: string;
  /** Force re-fetch keys even if already ready */
  includeSecrets?: boolean;
}): Promise<EnsureAppSupabaseResult> {
  if (!isSupabaseManagementConfigured()) {
    return {
      status: "skipped",
      projectRef: null,
      url: null,
      created: false,
      message:
        "Supabase Management API is not configured (SUPABASE_MANAGEMENT_ACCESS_TOKEN / ORG).",
    };
  }

  const config = getSupabaseManagementConfig()!;
  const orgSlug =
    trim(process.env.SUPABASE_MANAGEMENT_ORG_SLUG) ?? config.orgId;

  const binding = await loadAppSupabaseBinding(
    opts.projectId,
    opts.workspaceId,
  );
  if (!binding) {
    return {
      status: "error",
      projectRef: null,
      url: null,
      created: false,
      message: "Project not found.",
    };
  }

  // Websites skip auto Supabase — SEO/forms/webhooks only unless converted to app.
  if (binding.kind === "site") {
    return {
      status: "skipped",
      projectRef: null,
      url: null,
      created: false,
      message: "Websites do not auto-provision Supabase.",
    };
  }

  let ref = binding.ref;
  let created = false;

  if (!ref) {
    await patchBinding(opts.projectId, opts.workspaceId, {
      supabase_status: "pending",
    });

    const name = projectNameFor(opts.projectId, binding.title);
    const dbPass = generateDbPassword();
    const regionGroup =
      trim(process.env.SUPABASE_MANAGEMENT_REGION_GROUP) ?? "americas";
    // Free-plan orgs reject desired_instance_size — only send when explicitly set.
    const instanceSize = trim(process.env.SUPABASE_MANAGEMENT_INSTANCE_SIZE);

    const createBody: Record<string, unknown> = {
      name,
      organization_slug: orgSlug,
      db_pass: dbPass,
      region_selection: {
        type: "smartGroup",
        code: regionGroup,
      },
    };
    if (instanceSize) {
      createBody.desired_instance_size = instanceSize;
    }

    let res = await supabaseManagementFetch("/v1/projects", {
      method: "POST",
      body: JSON.stringify(createBody),
    });

    // Retry without instance size if the org is on the free plan.
    if (!res.ok && instanceSize) {
      const text = await res.text().catch(() => "");
      if (
        res.status === 402 ||
        /instance size cannot be specified/i.test(text)
      ) {
        delete createBody.desired_instance_size;
        res = await supabaseManagementFetch("/v1/projects", {
          method: "POST",
          body: JSON.stringify(createBody),
        });
      } else {
        await patchBinding(opts.projectId, opts.workspaceId, {
          supabase_status: "error",
        });
        return {
          status: "error",
          projectRef: null,
          url: null,
          created: false,
          message: `Supabase create failed (${res.status}): ${text.slice(0, 400)}`,
        };
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      await patchBinding(opts.projectId, opts.workspaceId, {
        supabase_status: "error",
      });
      return {
        status: "error",
        projectRef: null,
        url: null,
        created: false,
        message: `Supabase create failed (${res.status}): ${text.slice(0, 400)}`,
      };
    }

    const createdProject = (await res.json()) as { id?: string; ref?: string };
    ref = createdProject.ref ?? createdProject.id ?? null;
    if (!ref) {
      await patchBinding(opts.projectId, opts.workspaceId, {
        supabase_status: "error",
      });
      return {
        status: "error",
        projectRef: null,
        url: null,
        created: false,
        message: "Supabase create returned no project ref.",
      };
    }

    created = true;
    await patchBinding(opts.projectId, opts.workspaceId, {
      supabase_project_ref: ref,
      supabase_status: "pending",
    });

    try {
      await waitForProjectActive(ref);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await patchBinding(opts.projectId, opts.workspaceId, {
        supabase_status: "error",
      });
      return {
        status: "error",
        projectRef: ref,
        url: supabaseUrlForRef(ref),
        created: true,
        message,
      };
    }
  }

  const url = supabaseUrlForRef(ref);

  try {
    const keys = await fetchProjectApiKeys(ref);
    if (!keys.anonKey) {
      await patchBinding(opts.projectId, opts.workspaceId, {
        supabase_status: "error",
      });
      return {
        status: "error",
        projectRef: ref,
        url,
        created,
        message: "Supabase project has no anon API key yet.",
      };
    }

    await patchBinding(opts.projectId, opts.workspaceId, {
      supabase_project_ref: ref,
      supabase_status: "ready",
    });

    return {
      status: "ready",
      projectRef: ref,
      url,
      created,
      message: created ? "Supabase project created." : "Supabase project ready.",
      secrets: opts.includeSecrets
        ? {
            anonKey: keys.anonKey,
            serviceRoleKey: keys.serviceRoleKey,
          }
        : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await patchBinding(opts.projectId, opts.workspaceId, {
      supabase_status: "error",
    });
    return {
      status: "error",
      projectRef: ref,
      url,
      created,
      message,
    };
  }
}

/** Public-safe status for GET APIs (no secrets). */
export async function getAppSupabasePublicStatus(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<{
  status: AppSupabaseStatus;
  projectRef: string | null;
  url: string | null;
  configured: boolean;
}> {
  const binding = await loadAppSupabaseBinding(
    opts.projectId,
    opts.workspaceId,
  );
  return {
    configured: isSupabaseManagementConfigured(),
    status: binding?.status ?? "idle",
    projectRef: binding?.ref ?? null,
    url: binding?.ref ? supabaseUrlForRef(binding.ref) : null,
  };
}
