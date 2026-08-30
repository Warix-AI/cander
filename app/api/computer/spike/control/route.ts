import { NextResponse } from "next/server";
import { requireComputerAuth } from "@/lib/computer/spike/auth";
import { setSessionControlMode } from "@/lib/computer/session-runtime";
import type { ControlMode } from "@/lib/computer/computer-provider";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireComputerAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: { sessionId?: string; controlMode?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  const controlMode = body.controlMode as ControlMode | undefined;
  if (!sessionId || !controlMode) {
    return NextResponse.json(
      { error: "sessionId and controlMode required." },
      { status: 400 },
    );
  }

  if (controlMode !== "agent" && controlMode !== "user" && controlMode !== "paused") {
    return NextResponse.json({ error: "Invalid controlMode." }, { status: 400 });
  }

  const updated = await setSessionControlMode(sessionId, auth.userId, controlMode);
  if (!updated) {
    return NextResponse.json(
      { ok: false, error: "Session not found or failed to persist control_mode." },
      { status: 404 },
    );
  }

  if (updated.controlMode !== controlMode) {
    return NextResponse.json(
      {
        ok: false,
        error: `Failed to persist control_mode (got ${updated.controlMode}).`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    sessionId: updated.id,
    controlMode: updated.controlMode,
  });
}
