"use client";

import type { ApiBundle } from "@/lib/api";
import { bootstrapSupabaseEntities } from "@/lib/api/entity-sync";
import { bootstrapSupabaseOrgPolicy } from "@/lib/api/org-policy-sync";
import { bootstrapSupabaseConnectors } from "@/lib/api/connector-sync";
import { bootstrapSupabaseBrowser } from "@/lib/api/browser-sync";
import { bootstrapSupabaseChat } from "@/lib/api/chat-sync";
import { clearLegacyStorageAfterImport } from "@/lib/legacy-storage";
import type { WorkspaceCtx } from "@/lib/space-entities";

/** One-shot Supabase session bootstrap (Phases 1–5) + legacy cleanup. */
export async function bootstrapSupabaseSession(
  api: ApiBundle,
  ctx: WorkspaceCtx,
) {
  await bootstrapSupabaseEntities(api.entities, ctx);
  await bootstrapSupabaseOrgPolicy(ctx);
  await bootstrapSupabaseConnectors(ctx);
  await bootstrapSupabaseBrowser(ctx);
  await bootstrapSupabaseChat(api.chat, ctx);

  if (clearLegacyStorageAfterImport()) {
    console.info("[cander] cleared legacy localStorage after Supabase import");
  }
}

export { scanLegacyStorage, allSupabaseImportsComplete } from "@/lib/legacy-storage";
