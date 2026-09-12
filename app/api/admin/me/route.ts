/**
 * GET /api/admin/me — platform-admin session probe for /admin gate.
 */

import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return NextResponse.json({
    ok: true,
    userId: auth.user.id,
    email: auth.user.email ?? null,
  });
}
