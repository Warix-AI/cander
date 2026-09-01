/** Same-origin URL for a persisted chat attachment image (works in `<img src>` with session cookies). */
export function chatAttachmentImageUrl(attachmentId: string): string {
  return `/api/ai/raw-openai/attachments/${encodeURIComponent(attachmentId)}/image`;
}

/** Prefer a durable attachment URL over an inline data URL when both exist. */
export function resolveChatImageUrl(opts: {
  attachmentId?: string | null;
  dataUrl?: string | null;
  fallbackUrl?: string | null;
}): string | null {
  if (opts.attachmentId?.trim()) {
    return chatAttachmentImageUrl(opts.attachmentId.trim());
  }
  const data = opts.dataUrl?.trim() || opts.fallbackUrl?.trim();
  return data || null;
}
