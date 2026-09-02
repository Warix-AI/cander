/**
 * Load bytes for a persisted chat image attachment (job b64, then OpenAI Files).
 * Server-only.
 */

import { createOpenAIMediaClient } from "@/lib/ai/raw-openai/media-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function readChatAttachmentImageBytes(
  attachmentId: string,
  userId: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const admin = createSupabaseAdminClient();
  const { data: attachment, error: attError } = await admin
    .from("chat_attachments")
    .select("id, user_id, mime_type, openai_file_id, attachment_type")
    .eq("id", attachmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (attError || !attachment) return null;
  if (attachment.attachment_type !== "image") return null;

  const mimeType =
    typeof attachment.mime_type === "string" && attachment.mime_type.trim()
      ? attachment.mime_type
      : "image/png";

  const { data: job } = await admin
    .from("image_generation_jobs")
    .select("result_b64, mime_type")
    .eq("attachment_id", attachmentId)
    .eq("user_id", userId)
    .maybeSingle();

  const rawB64 =
    typeof job?.result_b64 === "string" && job.result_b64.trim()
      ? job.result_b64.trim()
      : null;
  if (rawB64) {
    const payload =
      /^data:[^;,]+;base64,([\s\S]+)$/.exec(rawB64)?.[1] || rawB64;
    return {
      bytes: Buffer.from(payload, "base64"),
      mimeType:
        typeof job?.mime_type === "string" && job.mime_type.trim()
          ? job.mime_type
          : mimeType,
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const openaiFileId =
    typeof attachment.openai_file_id === "string"
      ? attachment.openai_file_id.trim()
      : "";
  if (!apiKey || !openaiFileId) return null;

  const client = createOpenAIMediaClient(apiKey);
  const fileResponse = await client.files.content(openaiFileId);
  return {
    bytes: Buffer.from(await fileResponse.arrayBuffer()),
    mimeType,
  };
}
