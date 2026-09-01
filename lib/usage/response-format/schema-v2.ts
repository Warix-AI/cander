/**
 * Rich AI response format v2 — allowlisted structured blocks.
 * Validated server-side before reaching the client renderer.
 */

export const RESPONSE_FORMAT_VERSION = 2;

export const RESPONSE_BLOCK_TYPES_V2 = [
  "text",
  "markdown",
  "heading",
  "callout",
  "summary",
  "numbered_steps",
  "checklist",
  "table",
  "comparison_card",
  "metric",
  "insight",
  "citation",
  "source_link",
  "review_draft",
  "image_result",
  "image_gallery",
  "code",
  "file_changes",
  "sandbox_preview",
  "job_progress",
  "approval",
  "error_recovery",
  "follow_up",
] as const;

export type ResponseBlockTypeV2 = (typeof RESPONSE_BLOCK_TYPES_V2)[number];

export type RichResponseBlockV2 =
  | { type: "text"; text: string }
  | { type: "markdown"; markdown: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "callout"; tone: "info" | "success" | "warning" | "danger"; title?: string; body: string }
  | { type: "summary"; title?: string; body: string }
  | { type: "numbered_steps"; steps: string[] }
  | { type: "checklist"; items: Array<{ label: string; done?: boolean }> }
  | { type: "table"; columns: string[]; rows: string[][] }
  | {
      type: "comparison_card";
      title?: string;
      columns: string[];
      rows: Array<{ label: string; values: string[] }>;
    }
  | { type: "metric"; label: string; value: string; hint?: string }
  | { type: "insight"; title: string; body: string }
  | { type: "citation"; label: string; url?: string; sourceId?: string }
  | { type: "source_link"; title: string; url: string }
  | {
      type: "review_draft";
      title: string;
      body: string;
      copyLabel?: string;
    }
  | { type: "image_result"; url: string; alt?: string; caption?: string }
  | {
      type: "image_gallery";
      images: Array<{ url: string; alt?: string; caption?: string }>;
    }
  | { type: "code"; language?: string; code: string }
  | {
      type: "file_changes";
      title?: string;
      files: Array<{ path: string; summary: string }>;
    }
  | {
      type: "sandbox_preview";
      title: string;
      previewUrl: string;
      status?: "ready" | "building" | "failed";
    }
  | {
      type: "job_progress";
      title: string;
      status: "queued" | "running" | "completed" | "failed";
      detail?: string;
      percent?: number;
    }
  | {
      type: "approval";
      title: string;
      body: string;
      actionId: string;
      actionLabel: string;
      destructive?: boolean;
    }
  | { type: "error_recovery"; title: string; body: string; steps?: string[] }
  | {
      type: "follow_up";
      prompt: string;
      options: Array<{ id: string; label: string }>;
    };

export type RichResponseV2 = {
  version: typeof RESPONSE_FORMAT_VERSION;
  blocks: RichResponseBlockV2[];
};

export type ValidatedRichResponse =
  | { ok: true; response: RichResponseV2 }
  | { ok: false; fallbackMarkdown: string; errors: string[] };

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean);
}

function parseBlock(raw: unknown): RichResponseBlockV2 | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const type = asString(row.type) as ResponseBlockTypeV2;
  if (!RESPONSE_BLOCK_TYPES_V2.includes(type)) return null;

  switch (type) {
    case "text": {
      const text = asString(row.text).trim();
      return text ? { type, text } : null;
    }
    case "markdown": {
      const markdown = asString(row.markdown).trim();
      return markdown ? { type, markdown } : null;
    }
    case "heading": {
      const level = Number(row.level);
      const text = asString(row.text).trim();
      if (!text || ![1, 2, 3].includes(level)) return null;
      return { type, level: level as 1 | 2 | 3, text };
    }
    case "callout": {
      const tone = asString(row.tone) as "info" | "success" | "warning" | "danger";
      const body = asString(row.body).trim();
      if (!body || !["info", "success", "warning", "danger"].includes(tone)) return null;
      return {
        type,
        tone,
        title: asString(row.title).trim() || undefined,
        body,
      };
    }
    case "summary": {
      const body = asString(row.body).trim();
      return body
        ? { type, title: asString(row.title).trim() || undefined, body }
        : null;
    }
    case "numbered_steps": {
      const steps = asStringArray(row.steps);
      return steps.length ? { type, steps } : null;
    }
    case "checklist": {
      const itemsRaw = Array.isArray(row.items) ? row.items : [];
      const items = itemsRaw
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const obj = item as Record<string, unknown>;
          const label = asString(obj.label).trim();
          if (!label) return null;
          return { label, done: Boolean(obj.done) };
        })
        .filter(Boolean) as Array<{ label: string; done?: boolean }>;
      return items.length ? { type, items } : null;
    }
    case "table": {
      const columns = asStringArray(row.columns);
      const rowsRaw = Array.isArray(row.rows) ? row.rows : [];
      const rows = rowsRaw
        .map((entry) => asStringArray(entry))
        .filter((entry) => entry.length);
      return columns.length && rows.length ? { type, columns, rows } : null;
    }
    case "comparison_card": {
      const columns = asStringArray(row.columns);
      const rowsRaw = Array.isArray(row.rows) ? row.rows : [];
      const rows = rowsRaw
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const obj = entry as Record<string, unknown>;
          const label = asString(obj.label).trim();
          const values = asStringArray(obj.values);
          if (!label) return null;
          return { label, values };
        })
        .filter(Boolean) as Array<{ label: string; values: string[] }>;
      return rows.length ? { type, columns, rows } : null;
    }
    case "metric": {
      const label = asString(row.label).trim();
      const value = asString(row.value).trim();
      return label && value
        ? { type, label, value, hint: asString(row.hint).trim() || undefined }
        : null;
    }
    case "insight": {
      const title = asString(row.title).trim();
      const body = asString(row.body).trim();
      return title && body ? { type, title, body } : null;
    }
    case "citation": {
      const label = asString(row.label).trim();
      return label
        ? {
            type,
            label,
            url: asString(row.url).trim() || undefined,
            sourceId: asString(row.sourceId).trim() || undefined,
          }
        : null;
    }
    case "source_link": {
      const title = asString(row.title).trim();
      const url = asString(row.url).trim();
      return title && url ? { type, title, url } : null;
    }
    case "review_draft": {
      const title = asString(row.title).trim();
      const body = asString(row.body).trim();
      return title && body
        ? {
            type,
            title,
            body,
            copyLabel: asString(row.copyLabel).trim() || undefined,
          }
        : null;
    }
    case "image_result": {
      const url = asString(row.url).trim();
      return url
        ? {
            type,
            url,
            alt: asString(row.alt).trim() || undefined,
            caption: asString(row.caption).trim() || undefined,
          }
        : null;
    }
    case "image_gallery": {
      const imagesRaw = Array.isArray(row.images) ? row.images : [];
      const images = imagesRaw
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const obj = entry as Record<string, unknown>;
          const url = asString(obj.url).trim();
          if (!url) return null;
          return {
            url,
            alt: asString(obj.alt).trim() || undefined,
            caption: asString(obj.caption).trim() || undefined,
          };
        })
        .filter(Boolean) as Array<{ url: string; alt?: string; caption?: string }>;
      return images.length ? { type, images } : null;
    }
    case "code": {
      const code = asString(row.code);
      return code ? { type, code, language: asString(row.language).trim() || undefined } : null;
    }
    case "file_changes": {
      const filesRaw = Array.isArray(row.files) ? row.files : [];
      const files = filesRaw
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const obj = entry as Record<string, unknown>;
          const path = asString(obj.path).trim();
          const summary = asString(obj.summary).trim();
          if (!path) return null;
          return { path, summary };
        })
        .filter(Boolean) as Array<{ path: string; summary: string }>;
      return files.length
        ? { type, title: asString(row.title).trim() || undefined, files }
        : null;
    }
    case "sandbox_preview": {
      const title = asString(row.title).trim();
      const previewUrl = asString(row.previewUrl).trim();
      if (!title || !previewUrl) return null;
      const status = asString(row.status) as "ready" | "building" | "failed";
      return {
        type,
        title,
        previewUrl,
        status: ["ready", "building", "failed"].includes(status)
          ? status
          : undefined,
      };
    }
    case "job_progress": {
      const title = asString(row.title).trim();
      const statusRaw = asString(row.status);
      if (
        !title ||
        !["queued", "running", "completed", "failed"].includes(statusRaw)
      ) {
        return null;
      }
      const status = statusRaw as "queued" | "running" | "completed" | "failed";
      return {
        type,
        title,
        status,
        detail: asString(row.detail).trim() || undefined,
        percent:
          typeof row.percent === "number" && Number.isFinite(row.percent)
            ? Math.max(0, Math.min(100, row.percent))
            : undefined,
      };
    }
    case "approval": {
      const title = asString(row.title).trim();
      const body = asString(row.body).trim();
      const actionId = asString(row.actionId).trim();
      const actionLabel = asString(row.actionLabel).trim();
      if (!title || !body || !actionId || !actionLabel) return null;
      return {
        type,
        title,
        body,
        actionId,
        actionLabel,
        destructive: Boolean(row.destructive),
      };
    }
    case "error_recovery": {
      const title = asString(row.title).trim();
      const body = asString(row.body).trim();
      return title && body
        ? {
            type,
            title,
            body,
            steps: asStringArray(row.steps),
          }
        : null;
    }
    case "follow_up": {
      const prompt = asString(row.prompt).trim();
      const optionsRaw = Array.isArray(row.options) ? row.options : [];
      const options = optionsRaw
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const obj = entry as Record<string, unknown>;
          const id = asString(obj.id).trim();
          const label = asString(obj.label).trim();
          if (!id || !label) return null;
          return { id, label };
        })
        .filter(Boolean) as Array<{ id: string; label: string }>;
      return prompt && options.length ? { type, prompt, options } : null;
    }
    default:
      return null;
  }
}

export function validateRichResponse(raw: unknown): ValidatedRichResponse {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      fallbackMarkdown: "",
      errors: ["Response payload must be an object."],
    };
  }
  const payload = raw as Record<string, unknown>;
  const version = Number(payload.version);
  if (version !== RESPONSE_FORMAT_VERSION) {
    return {
      ok: false,
      fallbackMarkdown: asString(payload.fallbackMarkdown),
      errors: [`Unsupported response format version: ${String(payload.version)}`],
    };
  }
  if (!Array.isArray(payload.blocks)) {
    return {
      ok: false,
      fallbackMarkdown: asString(payload.fallbackMarkdown),
      errors: ["blocks[] required."],
    };
  }
  const blocks: RichResponseBlockV2[] = [];
  const errors: string[] = [];
  payload.blocks.forEach((entry, index) => {
    const parsed = parseBlock(entry);
    if (parsed) blocks.push(parsed);
    else errors.push(`Invalid block at index ${index}.`);
  });
  if (!blocks.length) {
    return {
      ok: false,
      fallbackMarkdown:
        asString(payload.fallbackMarkdown) ||
        "I couldn't format that response safely, so here is a plain answer instead.",
      errors,
    };
  }
  return {
    ok: true,
    response: { version: RESPONSE_FORMAT_VERSION, blocks },
  };
}

export function richResponseToMarkdown(response: RichResponseV2): string {
  const parts: string[] = [];
  for (const block of response.blocks) {
    switch (block.type) {
      case "text":
        parts.push(block.text);
        break;
      case "markdown":
        parts.push(block.markdown);
        break;
      case "heading":
        parts.push(`${"#".repeat(block.level)} ${block.text}`);
        break;
      case "callout":
        parts.push(
          block.title
            ? `**${block.title}:** ${block.body}`
            : block.body,
        );
        break;
      case "summary":
        parts.push(block.title ? `**${block.title}**\n${block.body}` : block.body);
        break;
      case "numbered_steps":
        parts.push(block.steps.map((step, i) => `${i + 1}. ${step}`).join("\n"));
        break;
      case "checklist":
        parts.push(
          block.items
            .map((item) => `- [${item.done ? "x" : " "}] ${item.label}`)
            .join("\n"),
        );
        break;
      case "table": {
        const header = `| ${block.columns.join(" | ")} |`;
        const sep = `| ${block.columns.map(() => "---").join(" | ")} |`;
        const rows = block.rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
        parts.push([header, sep, rows].join("\n"));
        break;
      }
      case "comparison_card":
      case "metric":
      case "insight":
      case "citation":
      case "source_link":
      case "review_draft":
      case "image_result":
      case "image_gallery":
      case "code":
      case "file_changes":
      case "sandbox_preview":
      case "job_progress":
      case "approval":
      case "error_recovery":
      case "follow_up":
        parts.push(JSON.stringify(block));
        break;
      default:
        break;
    }
  }
  return parts.filter(Boolean).join("\n\n");
}

export function coerceRichResponse(raw: unknown, fallbackText: string): RichResponseV2 | string {
  const validated = validateRichResponse(raw);
  if (validated.ok) return validated.response;
  const markdown = validated.fallbackMarkdown.trim() || fallbackText.trim();
  return markdown || "I couldn't format that response safely.";
}
