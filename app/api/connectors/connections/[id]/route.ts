import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { getUserConnection } from "@/lib/connectors/lifecycle";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const client = createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${auth.token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const result = await getUserConnection({
      client,
      connectionId: id,
      ownerId: auth.user.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, connection: result.connection });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load connection.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
