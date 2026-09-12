/**
 * POST /api/admin/chat — Platform Admin Cander turn (LLM + admin read tools).
 */

import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { runAdminAgentTurn } from "@/lib/admin/agent";
import { isAdminSection } from "@/lib/admin/sections";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  message?: string;
  history?: Array<{ role?: string; content?: string }>;
  currentSection?: string;
};

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }
  if (message.length > 20_000) {
    return NextResponse.json({ error: "Message too long." }, { status: 413 });
  }

  const history = (body.history ?? [])
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    )
    .slice(-12);

  const currentSection = isAdminSection(body.currentSection)
    ? body.currentSection
    : null;

  try {
    const result = await runAdminAgentTurn({
      message,
      history,
      currentSection,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[cander:admin-chat] turn failed", {
      error: msg.slice(0, 300),
      userId: auth.user.id,
    });
    return NextResponse.json(
      { ok: false, error: "The admin assistant is unavailable right now." },
      { status: 502 },
    );
  }
}
