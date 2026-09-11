/**
 * Browser client for the Cander front agent (POST /api/projects/:id/agent/turn).
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";
import type { FrontAgentDecision } from "@/lib/ai/agent/front-agent-types";

async function authToken() {
  if (!isSupabaseConfigured()) return null;
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function runProjectAgentTurnClient(opts: {
  projectId: string;
  workspaceId: string;
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  timeoutMs?: number;
}): Promise<FrontAgentDecision | null> {
  const token = await authToken();
  if (!token) return null;
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(opts.projectId)}/agent/turn`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: opts.workspaceId,
        message: opts.message,
        history: opts.history ?? [],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok?: boolean; decision?: FrontAgentDecision };
    return json.ok && json.decision ? json.decision : null;
  } catch {
    return null;
  }
}
