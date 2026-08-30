import { NextResponse } from "next/server";
import { requireComputerAuth } from "@/lib/computer/spike/auth";
import { DEFAULT_SPIKE_URL } from "@/lib/computer/spike/constants";
import { createAndBootstrapSession } from "@/lib/computer/session-runtime";
import { getOrCreateStreamBridge } from "@/lib/computer/spike/stream-bridge";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireComputerAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: { url?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Optional body.
  }

  const url = (body.url?.trim() || DEFAULT_SPIKE_URL).slice(0, 500);

  try {
    const { record, streamUrl, observation } = await createAndBootstrapSession({
      userId: auth.userId,
      scopeType: "chat",
      scopeId: `spike-${auth.userId}`,
      url,
      chatId: `spike-${auth.userId}`,
    });

    getOrCreateStreamBridge(record.id, streamUrl);

    return NextResponse.json({
      ok: true,
      sessionId: record.id,
      streamUrl,
      controlMode: record.controlMode,
      observation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
