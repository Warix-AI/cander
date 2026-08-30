import { NextResponse } from "next/server";
import { requireComputerAuth } from "@/lib/computer/spike/auth";
import { getComputerProvider } from "@/lib/computer/providers/vercel-sandbox-computer-provider";
import type { ComputerScopeType } from "@/lib/computer/computer-provider";

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

  try {
    const provider = getComputerProvider();
    const session = await provider.createOrReuseSession({
      userId: auth.userId,
      scopeType,
      scopeId,
      chatId: body.chatId ?? null,
      projectId: body.projectId ?? null,
      workspaceId: body.workspaceId ?? null,
      taskId: body.taskId ?? null,
      url: body.url,
    });
    return NextResponse.json({ ok: true, session });
  } catch (error) {
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
