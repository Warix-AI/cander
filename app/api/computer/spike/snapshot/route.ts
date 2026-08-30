import { NextResponse } from "next/server";
import { observeSpikeBrowser } from "@/lib/computer/spike/agent-browser-bootstrap";
import { requireComputerAuth } from "@/lib/computer/spike/auth";
import { resolveSandboxForSession } from "@/lib/computer/session-runtime";
import { updateComputerSession } from "@/lib/computer/session-store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireComputerAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: { sessionId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required." }, { status: 400 });
  }

  const resolved = await resolveSandboxForSession(sessionId, auth.userId);
  if (!resolved) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  try {
    const observation = await observeSpikeBrowser(resolved.sandbox);
    await updateComputerSession(sessionId, {
      current_url: observation.url,
      browser_state: { title: observation.title },
    });

    return NextResponse.json({
      ok: true,
      sessionId,
      controlMode: resolved.record.controlMode,
      observation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
