import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { listConnectorCatalog } from "@/lib/connectors/lifecycle";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
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
