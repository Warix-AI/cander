/**
 * POST|GET /api/cron/project-teardown
 * Vercel cron tick — permanently remove archived projects whose grace period
 * has ended: delete the database and Vercel project, delete/archive the repo,
 * then drop the row. Per-provider results are recorded on the project first.
 */

import { NextResponse } from "next/server";
import { runProjectTeardownSweep } from "@/lib/build/infra/archive";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handle(request: Request) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await runProjectTeardownSweep();
  console.info("[cander:project-teardown]", result);
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
