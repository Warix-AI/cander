/**
 * GET /api/ai/raw-openai/attachments/[id]/image
 * Serve a generated chat image by attachment id (cookie or bearer auth).
 */

import { NextResponse } from "next/server";
import { readChatAttachmentImageBytes } from "@/lib/ai/raw-openai/attachment-image-bytes";
import { resolveRequestUser } from "@/lib/usage/server/context";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const user = await resolveRequestUser(request, { allowCookie: true });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const attachmentId = id.trim();
  if (!attachmentId) {
    return NextResponse.json({ error: "Attachment id required." }, { status: 400 });
  }

  try {
    const asset = await readChatAttachmentImageBytes(attachmentId, user.id);
    if (!asset) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }
    return new Response(asset.bytes, {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control": "private, max-age=86400, immutable",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "openai_file_fetch_failed";
    return NextResponse.json({ error: message.slice(0, 200) }, { status: 502 });
  }
}
