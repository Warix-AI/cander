import { NextResponse } from "next/server";
import { requireComputerAuth } from "@/lib/computer/spike/auth";
import {
  resolveInputBridge,
  resolveSandboxForSession,
} from "@/lib/computer/session-runtime";
import { getOrCreateStreamBridge } from "@/lib/computer/spike/stream-bridge";
import { deliverStreamInput } from "@/lib/computer/stream-input";
import {
  deliverMouseViaCli,
  mouseEventsForCli,
} from "@/lib/computer/mouse-cli-input";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await requireComputerAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const sessionId = String(body.sessionId ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required." }, { status: 400 });
  }

  const resolved = await resolveInputBridge(sessionId, auth.userId);
  if (!resolved.ok) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status },
    );
  }

  const mouseEvents = mouseEventsForCli(body);
  if (mouseEvents.length > 0) {
    try {
      const sandboxResolved = await resolveSandboxForSession(sessionId, auth.userId);
      if (sandboxResolved?.sandbox) {
        const viaCli = await deliverMouseViaCli(sandboxResolved.sandbox, mouseEvents);
        if (viaCli.ok) {
          return NextResponse.json({ ok: true, delivery: "cli" });
        }
        console.warn("[computer] mouse CLI delivery failed, falling back to stream", viaCli.error);
      }
    } catch (error) {
      console.warn("[computer] mouse CLI unavailable, falling back to stream", error);
    }
  }

  const bridge = getOrCreateStreamBridge(sessionId, resolved.streamUrl);
  const delivered = await deliverStreamInput(sessionId, body, bridge);
  if (!delivered.ok) {
    return NextResponse.json(
      { ok: false, error: delivered.error },
      { status: delivered.status },
    );
  }

  return NextResponse.json({ ok: true, delivery: "stream" });
}
