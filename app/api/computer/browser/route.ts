import { NextResponse } from "next/server";
import { requireComputerAuth } from "@/lib/computer/spike/auth";
import { getComputerProvider } from "@/lib/computer/providers/vercel-sandbox-computer-provider";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireComputerAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: {
    sessionId?: string;
    action?: string;
    url?: string;
    ref?: string;
    value?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  const action = body.action?.trim() || "observe";
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required." }, { status: 400 });
  }

  const provider = getComputerProvider();

  try {
    let observation;
    switch (action) {
      case "open":
      case "navigate":
        observation = await provider.browserOpen(
          sessionId,
          auth.userId,
          body.url?.trim() || "https://canderhq.com",
        );
        break;
      case "observe":
        observation = await provider.browserObserve(sessionId, auth.userId);
        break;
      case "click":
        observation = await provider.browserClick(
          sessionId,
          auth.userId,
          body.ref?.trim() || "",
        );
        break;
      case "fill":
        observation = await provider.browserFill(
          sessionId,
          auth.userId,
          body.ref?.trim() || "",
          body.value ?? "",
        );
        break;
      default:
        return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, observation });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
