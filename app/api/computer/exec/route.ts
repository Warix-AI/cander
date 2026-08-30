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
    command?: string;
    args?: string[];
    action?: string;
    projectId?: string;
    path?: string;
    content?: string;
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

  const provider = getComputerProvider();

  try {
    if (body.action === "restore_project" && body.projectId) {
      const result = await provider.restoreProject(
        sessionId,
        auth.userId,
        body.projectId,
      );
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "write_file" && body.path) {
      await provider.writeFile(
        sessionId,
        auth.userId,
        body.path,
        body.content ?? "",
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "read_file" && body.path) {
      const content = await provider.readFile(sessionId, auth.userId, body.path);
      return NextResponse.json({ ok: true, content });
    }

    const command = body.command?.trim();
    if (!command) {
      return NextResponse.json({ error: "command or action required." }, { status: 400 });
    }

    const result = await provider.exec(
      sessionId,
      auth.userId,
      command,
      body.args ?? [],
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
