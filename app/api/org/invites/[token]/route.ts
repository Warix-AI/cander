import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("get_org_invite_by_token", {
    p_token: token,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }

  return NextResponse.json({
    orgName: row.org_name,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    plan: row.plan,
    expiresAt: row.expires_at,
  });
}
