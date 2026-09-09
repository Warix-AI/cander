import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  COMPUTER_SESSION_STATUS_COLUMNS,
  noteSupabaseEgress,
} from "@/lib/supabase/egress";
import type {
  ComputerScopeType,
  ComputerSessionRecord,
  ComputerSessionStatus,
  ControlMode,
} from "@/lib/computer/computer-provider";

export type ComputerSessionRow = {
  id: string;
  user_id: string;
  scope_type: ComputerScopeType;
  scope_id: string;
  chat_id: string | null;
  project_id: string | null;
  workspace_id: string | null;
  task_id: string | null;
  provider: string;
  provider_session_id: string | null;
  status: ComputerSessionStatus;
  control_mode: ControlMode;
  current_url: string | null;
  stream_url: string | null;
  browser_state: Record<string, unknown> | null;
  build_state: Record<string, unknown> | null;
  created_at: string;
  last_active_at: string;
  expires_at: string | null;
};

function mapRow(row: ComputerSessionRow): ComputerSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    chatId: row.chat_id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    provider: row.provider,
    providerSessionId: row.provider_session_id,
    status: row.status,
    controlMode: row.control_mode,
    currentUrl: row.current_url,
    streamUrl: row.stream_url,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    expiresAt: row.expires_at,
  };
}

export async function findActiveSessionByScope(
  userId: string,
  scopeType: ComputerScopeType,
  scopeId: string,
): Promise<ComputerSessionRecord | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("computer_sessions")
    .select(COMPUTER_SESSION_STATUS_COLUMNS)
    .eq("user_id", userId)
    .eq("scope_type", scopeType)
    .eq("scope_id", scopeId)
    .in("status", ["starting", "active", "idle"])
    .order("last_active_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  noteSupabaseEgress({
    route: "computer_sessions.findActiveByScope",
    columns: COMPUTER_SESSION_STATUS_COLUMNS,
    rowCount: data ? 1 : 0,
  });
  if (error || !data) {
    return null;
  }
  return mapRow(data as unknown as ComputerSessionRow);
}

/** Latest active build_app session for a project (any collaborator). */
export async function findActiveBuildSessionForProject(
  projectId: string,
): Promise<ComputerSessionRecord | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("computer_sessions")
    .select(COMPUTER_SESSION_STATUS_COLUMNS)
    .eq("project_id", projectId)
    .eq("scope_type", "project")
    .in("status", ["starting", "active", "idle"])
    .order("last_active_at", { ascending: false })
    .limit(12);

  noteSupabaseEgress({
    route: "computer_sessions.findActiveBuild",
    columns: COMPUTER_SESSION_STATUS_COLUMNS,
    rowCount: data?.length ?? 0,
  });

  if (error || !data?.length) {
    return null;
  }
  const rows = data as unknown as ComputerSessionRow[];
  const build = rows.find((r) => r.build_state?.purpose === "build_app");
  return build ? mapRow(build) : null;
}

export async function getComputerSessionRowById(
  sessionId: string,
): Promise<ComputerSessionRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("computer_sessions")
    .select(COMPUTER_SESSION_STATUS_COLUMNS)
    .eq("id", sessionId)
    .maybeSingle();
  noteSupabaseEgress({
    route: "computer_sessions.getById",
    columns: COMPUTER_SESSION_STATUS_COLUMNS,
    rowCount: data ? 1 : 0,
  });
  if (error || !data) return null;
  return data as unknown as ComputerSessionRow;
}

export async function insertComputerSession(
  row: Omit<ComputerSessionRow, "created_at" | "last_active_at"> & {
    created_at?: string;
    last_active_at?: string;
  },
): Promise<ComputerSessionRecord> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const payload = {
    ...row,
    created_at: row.created_at ?? now,
    last_active_at: row.last_active_at ?? now,
  };
  const { data, error } = await admin
    .from("computer_sessions")
    .insert(payload)
    .select(COMPUTER_SESSION_STATUS_COLUMNS)
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to insert computer session.");
  }
  return mapRow(data as unknown as ComputerSessionRow);
}

export async function updateComputerSession(
  sessionId: string,
  patch: Partial<
    Pick<
      ComputerSessionRow,
      | "status"
      | "control_mode"
      | "current_url"
      | "stream_url"
      | "provider_session_id"
      | "browser_state"
      | "build_state"
      | "expires_at"
      | "last_active_at"
    >
  >,
): Promise<ComputerSessionRecord | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("computer_sessions")
    .update({ ...patch, last_active_at: patch.last_active_at ?? new Date().toISOString() })
    .eq("id", sessionId)
    .select(COMPUTER_SESSION_STATUS_COLUMNS)
    .single();
  if (error || !data) {
    console.error("[computer] updateComputerSession failed", {
      sessionId,
      patch,
      error: error?.message,
    });
    return null;
  }
  return mapRow(data as unknown as ComputerSessionRow);
}

export async function getComputerSessionById(
  sessionId: string,
  userId: string,
): Promise<ComputerSessionRecord | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("computer_sessions")
    .select(COMPUTER_SESSION_STATUS_COLUMNS)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return mapRow(data as unknown as ComputerSessionRow);
}

export async function markComputerSessionStopped(sessionId: string): Promise<void> {
  await updateComputerSession(sessionId, { status: "stopped" });
}
