/**
 * POST|GET /api/cron/sandbox-gc
 * Vercel cron tick — stop idle build sandboxes and retire abandoned ones.
 *
 * - Idle (no activity for BUILD_SANDBOX_IDLE_MS, no active build job): stop
 *   the running session. Persistent VMs keep their filesystem snapshot and
 *   resume in seconds on the next open.
 * - Abandoned (record expired, or non-persistent VM whose session timed out):
 *   retire and clear the project pointer so the next open creates cleanly.
 * - Stale leases are removed as a safety net.
 */

import { NextResponse } from "next/server";
import { runSandboxGc } from "@/lib/build/sandbox/gc";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handle(request: Request) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await runSandboxGc();
  console.info("[cander:sandbox-gc]", result);
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
