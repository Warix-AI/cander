import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { listConnectorCatalog } from "@/lib/connectors/lifecycle";
import { checkConnectorRateLimitAsync } from "@/lib/connectors/rate-limit";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";

export const runtime = "nodejs";

const CATALOG_RATE_WORKSPACE = "catalog";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const rate = await checkConnectorRateLimitAsync({
    key: `read:${auth.user.id}:catalog`,
    category: "connector_read",
    workspaceId: CATALOG_RATE_WORKSPACE,
    profileId: auth.user.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  const client = createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${auth.token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const catalog = await listConnectorCatalog(client);
    return NextResponse.json({ ok: true, catalog });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load catalog.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
