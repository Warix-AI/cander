import { NextResponse } from "next/server";
import { runSpikeAgentAction } from "@/lib/computer/spike/agent-browser-bootstrap";
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

  let body: {
    sessionId?: string;
    action?: string;
    ref?: string;
    value?: string;
    key?: string;
  } = {};
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

  if (resolved.record.controlMode === "user") {
    return NextResponse.json(
      { error: "Agent paused while user has control." },
      { status: 409 },
    );
  }

  const action = body.action?.trim() || "click";
  const ref = body.ref?.trim();
  if (!ref && action !== "scroll") {
    return NextResponse.json({ error: "ref required." }, { status: 400 });
  }

  try {
    let observation;
    switch (action) {
      case "click":
        observation = await runSpikeAgentAction(resolved.sandbox, "click", [ref!]);
        break;
      case "fill":
        observation = await runSpikeAgentAction(resolved.sandbox, "fill", [
          ref!,
          body.value ?? "",
        ]);
        break;
      case "press":
        observation = await runSpikeAgentAction(resolved.sandbox, "press", [
          body.key ?? ref!,
        ]);
        break;
      case "scroll":
        observation = await runSpikeAgentAction(resolved.sandbox, "scroll", [
          body.value ?? "down",
        ]);
        break;
      default:
        return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    await updateComputerSession(sessionId, {
      current_url: observation.url,
      control_mode: "agent",
      browser_state: { title: observation.title },
    });

    return NextResponse.json({
      ok: true,
      sessionId,
      controlMode: "agent",
      observation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
