/**
 * GET /api/ai/raw-openai/attachments/[id]/image
 * Serve a generated chat image by attachment id (cookie or bearer auth).
 */

import { NextResponse } from "next/server";
import { createOpenAIMediaClient } from "@/lib/ai/raw-openai/media-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

  const admin = createSupabaseAdminClient();
  const { data: attachment, error: attError } = await admin
    .from("chat_attachments")
    .select("id, user_id, mime_type, openai_file_id, attachment_type")
    .eq("id", attachmentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (attError || !attachment) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }
  if (attachment.attachment_type !== "image") {
    return NextResponse.json({ error: "Not an image attachment." }, { status: 400 });
  }

  const mimeType =
    typeof attachment.mime_type === "string" && attachment.mime_type.trim()
      ? attachment.mime_type
      : "image/png";

  const { data: job } = await admin
    .from("image_generation_jobs")
    .select("result_b64, mime_type")
    .eq("attachment_id", attachmentId)
    .eq("user_id", user.id)
    .maybeSingle();

  const b64 =
    typeof job?.result_b64 === "string" && job.result_b64.trim()
      ? job.result_b64.trim()
      : null;
  if (b64) {
    const bytes = Buffer.from(b64, "base64");
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type":
          typeof job?.mime_type === "string" && job.mime_type.trim()
            ? job.mime_type
            : mimeType,
        "Cache-Control": "private, max-age=86400, immutable",
      },
    });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const openaiFileId =
    typeof attachment.openai_file_id === "string"
      ? attachment.openai_file_id.trim()
      : "";
  if (!apiKey || !openaiFileId) {
    return NextResponse.json({ error: "Image bytes not available." }, { status: 404 });
  }

  try {
    const client = createOpenAIMediaClient(apiKey);
    const fileResponse = await client.files.content(openaiFileId);
    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=86400, immutable",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "openai_file_fetch_failed";
    return NextResponse.json({ error: message.slice(0, 200) }, { status: 502 });
  }
}
