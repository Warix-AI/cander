import { NextResponse } from "next/server";
import { requireComputerAuth } from "@/lib/computer/spike/auth";
import { resolveStreamSession } from "@/lib/computer/session-runtime";
import {
  getOrCreateStreamBridge,
  getStreamBridgeState,
} from "@/lib/computer/spike/stream-bridge";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = await requireComputerAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required." }, { status: 400 });
  }

  const resolved = await resolveStreamSession(sessionId, auth.userId);
  if (!resolved) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const bridge = getOrCreateStreamBridge(sessionId, resolved.streamUrl);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      send("status", {
        type: "status",
        connectionState: bridge.getState(),
        sessionId,
        controlMode: resolved.controlMode,
        reconnected: true,
      });

      const unsubscribe = bridge.subscribe((raw) => {
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          send("frame", parsed);
        } catch {
          send("raw", { data: raw });
        }
      });

      const statusInterval = setInterval(() => {
        send("status", {
          type: "status",
          connectionState: getStreamBridgeState(sessionId),
          sessionId,
          controlMode: resolved.controlMode,
        });
      }, 5_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(statusInterval);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
