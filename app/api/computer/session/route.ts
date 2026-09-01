import { NextResponse } from "next/server";
import { requireComputerAuth } from "@/lib/computer/spike/auth";
import { getComputerProvider } from "@/lib/computer/providers/vercel-sandbox-computer-provider";
import type { ComputerScopeType } from "@/lib/computer/computer-provider";
import {
  enforceUsageForRequest,
  finalizeUsageReservation,
} from "@/lib/usage/server/guard-route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireComputerAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: {
    scopeType?: string;
    scopeId?: string;
    chatId?: string;
    projectId?: string;
    workspaceId?: string;
    taskId?: string;
    url?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const scopeType = body.scopeType as ComputerScopeType | undefined;
  const scopeId = body.scopeId?.trim();
  if (!scopeType || !scopeId) {
    return NextResponse.json(
      { error: "scopeType and scopeId required." },
      { status: 400 },
    );
  }

  const workspaceId = body.workspaceId?.trim();
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId required for sandbox sessions." },
      { status: 400 },
    );
  }

  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() ||
    `sandbox-session:${workspaceId}:${scopeType}:${scopeId}`;
  const usage = await enforceUsageForRequest({
    request,
    feature: "sandbox_runtime",
    workspaceId,
    idempotencyKey,
    estimatedUnits: 1,
    provider: "vercel",
    allowCookieAuth: true,
    metadata: { scopeType, scopeId, projectId: body.projectId ?? null },
  });
  if (!usage.ok) {
    return usage.response;
  }

  try {
    const provider = getComputerProvider();
    const session = await provider.createOrReuseSession({
      userId: auth.userId,
      scopeType,
      scopeId,
      chatId: body.chatId ?? null,
      projectId: body.projectId ?? null,
      workspaceId,
      taskId: body.taskId ?? null,
      url: body.url,
    });
    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "confirmed",
      actualUnits: 1,
    });
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    await finalizeUsageReservation({
      reservationId: usage.reservationId,
      status: "failed",
    });
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = await requireComputerAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required." }, { status: 400 });
  }

  const session = await getComputerProvider().getSession(sessionId, auth.userId);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, session });
}

export async function DELETE(request: Request) {
  const auth = await requireComputerAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required." }, { status: 400 });
  }

  await getComputerProvider().stopSession(sessionId, auth.userId);
  return NextResponse.json({ ok: true });
}
