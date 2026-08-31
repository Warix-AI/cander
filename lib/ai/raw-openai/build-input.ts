/**
 * Build OpenAI Responses API input from chat history + attachment file refs.
 */

export type ChatMsg = {
  role: "user" | "assistant" | "system";
  content: string;
  /** Optional client message id for linking prior attachments */
  id?: string;
};

export type AttachmentRef = {
  id: string;
  openaiFileId: string;
  attachmentType: "image" | "document" | "audio";
  messageId?: string | null;
  /** When true, attach to the current (last) user turn */
  forCurrentTurn?: boolean;
};

export type ResponseContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; file_id: string; detail: "auto" | "low" | "high" }
  | { type: "input_image"; image_url: string; detail: "auto" | "low" | "high" }
  | { type: "input_file"; file_id: string };

export type ResponseInputItem = {
  role: "system" | "user" | "assistant";
  content: string | ResponseContentPart[];
};

function partsForAttachments(refs: AttachmentRef[]): ResponseContentPart[] {
  const parts: ResponseContentPart[] = [];
  for (const ref of refs) {
    if (ref.attachmentType === "image") {
      parts.push({
        type: "input_image",
        file_id: ref.openaiFileId,
        detail: "auto",
      });
    } else if (ref.attachmentType === "document") {
      parts.push({
        type: "input_file",
        file_id: ref.openaiFileId,
      });
    }
  }
  return parts;
}

function mergeUserContent(
  text: string,
  refs: AttachmentRef[],
  fallbackImageUrls: string[] = [],
): string | ResponseContentPart[] {
  const parts: ResponseContentPart[] = [
    { type: "input_text", text: text || "(see attached)" },
    ...partsForAttachments(refs),
    ...fallbackImageUrls.slice(0, 4).map((url) => ({
      type: "input_image" as const,
      image_url: url,
      detail: "auto" as const,
    })),
  ];
  if (parts.length === 1 && parts[0]?.type === "input_text") {
    return parts[0].text;
  }
  return parts;
}

/**
 * Build Responses `input` array.
 * Prior attachments keyed by messageId are placed on matching user turns.
 * Current-turn refs go on the last user turn (with optional data-URL fallbacks).
 */
export function buildRawOpenAIInput(opts: {
  system: string;
  messages: ChatMsg[];
  attachments: AttachmentRef[];
  fallbackImageUrls?: string[];
}): ResponseInputItem[] {
  const system = opts.system.trim() || "You are a helpful assistant.";
  const input: ResponseInputItem[] = [{ role: "system", content: system }];

  const byMessage = new Map<string, AttachmentRef[]>();
  const currentTurn: AttachmentRef[] = [];

  for (const a of opts.attachments) {
    if (a.forCurrentTurn || !a.messageId) {
      currentTurn.push(a);
      continue;
    }
    const list = byMessage.get(a.messageId) ?? [];
    list.push(a);
    byMessage.set(a.messageId, list);
  }

  let lastUserIdx = -1;
  for (const m of opts.messages) {
    const role =
      m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user";
    const text = (m.content || "").slice(0, 100_000);
    if (!text.trim() && role !== "user") continue;

    if (role === "user") {
      const linked = m.id ? byMessage.get(m.id) ?? [] : [];
      input.push({
        role: "user",
        content: mergeUserContent(text, linked),
      });
      lastUserIdx = input.length - 1;
    } else {
      input.push({ role, content: text });
    }
  }

  const fallbacks = (opts.fallbackImageUrls || []).filter(
    (u) => typeof u === "string" && u.length > 0,
  );

  if (lastUserIdx >= 0 && (currentTurn.length || fallbacks.length)) {
    const prev = input[lastUserIdx]!;
    const text =
      typeof prev.content === "string"
        ? prev.content
        : prev.content.find((p) => p.type === "input_text")?.text || "";
    const alreadyLinked =
      typeof prev.content === "string"
        ? []
        : // keep historical message-linked parts by re-deriving from text + current only
          [];
    void alreadyLinked;
    // Re-merge: historical linked parts for this turn were already applied;
    // add currentTurn + fallbacks on top of existing array or text.
    if (typeof prev.content === "string") {
      input[lastUserIdx] = {
        role: "user",
        content: mergeUserContent(text, currentTurn, fallbacks),
      };
    } else {
      const existing = [...prev.content];
      const have = new Set(
        existing
          .map((p) =>
            p.type === "input_image" && "file_id" in p
              ? p.file_id
              : p.type === "input_file"
                ? p.file_id
                : "",
          )
          .filter(Boolean),
      );
      for (const part of partsForAttachments(currentTurn)) {
        const fid =
          part.type === "input_file"
            ? part.file_id
            : part.type === "input_image" && "file_id" in part
              ? part.file_id
              : "";
        if (fid && have.has(fid)) continue;
        existing.push(part);
        if (fid) have.add(fid);
      }
      for (const url of fallbacks.slice(0, 4)) {
        existing.push({ type: "input_image", image_url: url, detail: "auto" });
      }
      input[lastUserIdx] = { role: "user", content: existing };
    }
  }

  return input;
}
