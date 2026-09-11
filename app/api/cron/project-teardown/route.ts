/**
 * POST|GET /api/cron/project-teardown
 * Vercel cron tick — permanently remove archived projects whose grace period
 * has ended: delete the database and Vercel project, delete/archive the repo,
 * then drop the row. Per-provider results are recorded on the project first.
 */

import { NextResponse } from "next/server";
import { runProjectTeardownSweep } from "@/lib/build/infra/archive";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = request.headers.get("x-cron-secret")?.trim() || "";
  return bearer === secret || headerSecret === secret;
}

async function handle(request: Request) {
  if (!authorizeCron(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
