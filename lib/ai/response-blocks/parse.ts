/**
 * Parse / validate rich response blocks (allowlist).
 * Unknown types are skipped — never throw.
 */

import {
  RESPONSE_FORMAT_VERSION,
  isKnownResponseBlockType,
  type RichResponse,
  type RichResponseBlock,
  type ProcessStep,
  type HierarchyNode,
  type DecisionCriterion,
  type DecisionScore,
  type RankingItem,
  type StatusItem,
  type FaqItem,
} from "./types.ts";

export type ValidatedRichResponse =
  | { ok: true; response: RichResponse }
  | { ok: false; fallbackMarkdown: string; errors: string[] };

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean);
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function parseProcess(row: Record<string, unknown>): RichResponseBlock | null {
  const stepsRaw = Array.isArray(row.steps) ? row.steps : [];
  const steps: ProcessStep[] = [];
  const ids = new Set<string>();
  for (const entry of stepsRaw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    let id = asString(obj.id).trim();
    const label = asString(obj.label).trim();
    if (!label) continue;
    if (!id) id = `step-${steps.length + 1}`;
    if (ids.has(id)) id = `${id}-${steps.length + 1}`;
    ids.add(id);
    const nextRaw = asStringArray(obj.next);
    steps.push({
      id,
      label,
      description: asString(obj.description).trim() || undefined,
      status: asString(obj.status).trim() || undefined,
      next: nextRaw.length ? uniqueIds(nextRaw) : undefined,
    });
  }
  if (!steps.length) return null;
  // Drop dangling next refs gracefully.
  const valid = new Set(steps.map((s) => s.id));
  for (const step of steps) {
    if (!step.next?.length) continue;
    step.next = step.next.filter((id) => valid.has(id));
    if (!step.next.length) delete step.next;
  }
  return {
    type: "process",
    title: asString(row.title).trim() || undefined,
    steps,
  };
}

function parseHierarchy(row: Record<string, unknown>): RichResponseBlock | null {
  const nodesRaw = Array.isArray(row.nodes) ? row.nodes : [];
  const nodes: HierarchyNode[] = [];
  const ids = new Set<string>();
  for (const entry of nodesRaw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    let id = asString(obj.id).trim();
    const label = asString(obj.label).trim();
    if (!label) continue;
    if (!id) id = `node-${nodes.length + 1}`;
    if (ids.has(id)) id = `${id}-${nodes.length + 1}`;
    ids.add(id);
    nodes.push({
      id,
      label,
      description: asString(obj.description).trim() || undefined,
      parentId: asString(obj.parentId).trim() || undefined,
    });
  }
  if (!nodes.length) return null;
  const valid = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    if (node.parentId && (!valid.has(node.parentId) || node.parentId === node.id)) {
      delete node.parentId;
    }
  }
  return {
    type: "hierarchy",
    title: asString(row.title).trim() || undefined,
    nodes,
  };
}

function parseDecisionMatrix(
  row: Record<string, unknown>,
): RichResponseBlock | null {
  const options = asStringArray(row.options);
  const criteriaRaw = Array.isArray(row.criteria) ? row.criteria : [];
  const criteria: DecisionCriterion[] = [];
  for (const entry of criteriaRaw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const name = asString(obj.name).trim();
    if (!name) continue;
    const weight =
      typeof obj.weight === "number" && Number.isFinite(obj.weight)
        ? obj.weight
        : undefined;
    criteria.push({ name, weight });
  }
  const scoresRaw = Array.isArray(row.scores) ? row.scores : [];
  const scores: DecisionScore[] = [];
  for (const entry of scoresRaw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const option = asString(obj.option).trim();
    const criterion = asString(obj.criterion).trim();
    const score = Number(obj.score);
    if (!option || !criterion || !Number.isFinite(score)) continue;
    scores.push({
      option,
      criterion,
      score,
      explanation: asString(obj.explanation).trim() || undefined,
    });
  }
  if (!options.length || !criteria.length || !scores.length) return null;
  return {
    type: "decision_matrix",
    title: asString(row.title).trim() || undefined,
    options,
    criteria,
    scores,
    recommendation: asString(row.recommendation).trim() || undefined,
  };
}

function parseProsCons(row: Record<string, unknown>): RichResponseBlock | null {
  const pros = asStringArray(row.pros);
  const cons = asStringArray(row.cons);
  if (!pros.length && !cons.length) return null;
  return {
    type: "pros_cons",
    title: asString(row.title).trim() || undefined,
    pros,
    cons,
    conclusion: asString(row.conclusion).trim() || undefined,
  };
}

function parseRanking(row: Record<string, unknown>): RichResponseBlock | null {
  const itemsRaw = Array.isArray(row.items) ? row.items : [];
  const items: RankingItem[] = [];
  for (const entry of itemsRaw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const label = asString(obj.label).trim();
    const rank = Number(obj.rank);
    if (!label || !Number.isFinite(rank)) continue;
    items.push({
      rank,
      label,
      score:
        typeof obj.score === "number" && Number.isFinite(obj.score)
          ? obj.score
          : undefined,
      reason: asString(obj.reason).trim() || undefined,
    });
  }
  if (!items.length) return null;
  items.sort((a, b) => a.rank - b.rank);
  return {
    type: "ranking",
    title: asString(row.title).trim() || undefined,
    items,
  };
}

function parseStatus(row: Record<string, unknown>): RichResponseBlock | null {
  const itemsRaw = Array.isArray(row.items) ? row.items : [];
  const items: StatusItem[] = [];
  for (const entry of itemsRaw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const label = asString(obj.label).trim();
    const status = asString(obj.status) as StatusItem["status"];
    if (
      !label ||
      !["pending", "in_progress", "complete", "blocked"].includes(status)
    ) {
      continue;
    }
    items.push({
      label,
      status,
      detail: asString(obj.detail).trim() || undefined,
      blocker: asString(obj.blocker).trim() || undefined,
      nextAction: asString(obj.nextAction).trim() || undefined,
    });
  }
  if (!items.length) return null;
  return {
    type: "status",
    title: asString(row.title).trim() || undefined,
    items,
  };
}

function parseBeforeAfter(
  row: Record<string, unknown>,
): RichResponseBlock | null {
  const beforeObj =
    row.before && typeof row.before === "object"
      ? (row.before as Record<string, unknown>)
      : null;
  const afterObj =
    row.after && typeof row.after === "object"
      ? (row.after as Record<string, unknown>)
      : null;
  const beforeItems = asStringArray(beforeObj?.items);
  const afterItems = asStringArray(afterObj?.items);
  if (!beforeItems.length && !afterItems.length) return null;
  return {
    type: "before_after",
    title: asString(row.title).trim() || undefined,
    before: {
      title: asString(beforeObj?.title).trim() || undefined,
      items: beforeItems,
    },
    after: {
      title: asString(afterObj?.title).trim() || undefined,
      items: afterItems,
    },
  };
}

function parseFaq(row: Record<string, unknown>): RichResponseBlock | null {
  const itemsRaw = Array.isArray(row.items) ? row.items : [];
  const items: FaqItem[] = [];
  for (const entry of itemsRaw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const question = asString(obj.question).trim();
    const answer = asString(obj.answer).trim();
    if (!question || !answer) continue;
    items.push({ question, answer });
  }
  if (!items.length) return null;
  return {
    type: "faq",
    title: asString(row.title).trim() || undefined,
    items,
  };
}

export function parseRichBlock(raw: unknown): RichResponseBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const type = asString(row.type).trim();
  if (!isKnownResponseBlockType(type)) return null;

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
      if (!body || !["info", "success", "warning", "danger"].includes(tone)) {
        return null;
      }
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
      return rows.length
        ? {
            type,
            title: asString(row.title).trim() || undefined,
            columns,
            rows,
          }
        : null;
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
        .filter(Boolean) as Array<{
        url: string;
        alt?: string;
        caption?: string;
      }>;
      return images.length ? { type, images } : null;
    }
    case "code": {
      const code = asString(row.code);
      return code
        ? { type, code, language: asString(row.language).trim() || undefined }
        : null;
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
      return {
        type,
        title,
        status: statusRaw as "queued" | "running" | "completed" | "failed",
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
        ? { type, title, body, steps: asStringArray(row.steps) }
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
    case "process":
      return parseProcess(row);
    case "hierarchy":
      return parseHierarchy(row);
    case "decision_matrix":
      return parseDecisionMatrix(row);
    case "pros_cons":
      return parseProsCons(row);
    case "ranking":
      return parseRanking(row);
    case "status":
      return parseStatus(row);
    case "before_after":
      return parseBeforeAfter(row);
    case "faq":
      return parseFaq(row);
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
  const blocks: RichResponseBlock[] = [];
  const errors: string[] = [];
  payload.blocks.forEach((entry, index) => {
    const type =
      entry && typeof entry === "object"
        ? asString((entry as { type?: unknown }).type)
        : "";
    if (type && !isKnownResponseBlockType(type)) {
      // Unknown future types: skip safely, do not fail the whole payload.
      errors.push(`Unknown block type at index ${index}: ${type}`);
      return;
    }
    const parsed = parseRichBlock(entry);
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

export function coerceRichResponse(
  raw: unknown,
  fallbackMarkdown?: string,
): RichResponse | string {
  const validated = validateRichResponse(raw);
  if (validated.ok) return validated.response;
  return (
    validated.fallbackMarkdown ||
    fallbackMarkdown ||
    "I couldn't format that response safely, so here is a plain answer instead."
  );
}

export function richBlockToMarkdown(block: RichResponseBlock): string {
  switch (block.type) {
    case "text":
      return block.text;
    case "markdown":
      return block.markdown;
    case "heading":
      return `${"#".repeat(block.level)} ${block.text}`;
    case "callout":
      return block.title ? `**${block.title}:** ${block.body}` : block.body;
    case "summary":
      return block.title ? `**${block.title}**\n${block.body}` : block.body;
    case "numbered_steps":
      return block.steps.map((step, i) => `${i + 1}. ${step}`).join("\n");
    case "checklist":
      return block.items
        .map((item) => `- [${item.done ? "x" : " "}] ${item.label}`)
        .join("\n");
    case "table": {
      const header = `| ${block.columns.join(" | ")} |`;
      const sep = `| ${block.columns.map(() => "---").join(" | ")} |`;
      const rows = block.rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
      return [header, sep, rows].join("\n");
    }
    case "comparison_card":
      return [
        block.title ? `**${block.title}**` : "",
        `| | ${block.columns.join(" | ")} |`,
        `| --- | ${block.columns.map(() => "---").join(" | ")} |`,
        ...block.rows.map(
          (row) => `| ${row.label} | ${row.values.join(" | ")} |`,
        ),
      ]
        .filter(Boolean)
        .join("\n");
    case "process":
      return [
        block.title ? `**${block.title}**` : "",
        ...block.steps.map(
          (step, i) =>
            `${i + 1}. **${step.label}**${step.description ? ` — ${step.description}` : ""}`,
        ),
      ]
        .filter(Boolean)
        .join("\n");
    case "hierarchy": {
      const byId = new Map(block.nodes.map((node) => [node.id, node]));
      const depthOf = (nodeId: string, seen = new Set<string>()): number => {
        if (seen.has(nodeId)) return 0;
        seen.add(nodeId);
        const node = byId.get(nodeId);
        if (!node?.parentId || !byId.has(node.parentId)) return 0;
        return 1 + depthOf(node.parentId, seen);
      };
      return [
        block.title ? `**${block.title}**` : "",
        ...block.nodes.map((node) => {
          const indent = "  ".repeat(depthOf(node.id));
          return `${indent}- ${node.label}${node.description ? `: ${node.description}` : ""}`;
        }),
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "decision_matrix": {
      const header = ["Option", ...block.criteria.map((c) => c.name)];
      const rows = block.options.map((option) => {
        const cells = block.criteria.map((criterion) => {
          const hit = block.scores.find(
            (score) =>
              score.option === option && score.criterion === criterion.name,
          );
          return hit ? String(hit.score) : "—";
        });
        return `| ${option} | ${cells.join(" | ")} |`;
      });
      return [
        block.title ? `**${block.title}**` : "",
        `| ${header.join(" | ")} |`,
        `| ${header.map(() => "---").join(" | ")} |`,
        ...rows,
        block.recommendation ? `\nRecommendation: ${block.recommendation}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "pros_cons":
      return [
        block.title ? `**${block.title}**` : "",
        "**Pros**",
        ...block.pros.map((p) => `- ${p}`),
        "**Cons**",
        ...block.cons.map((c) => `- ${c}`),
        block.conclusion ? `\n${block.conclusion}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "ranking":
      return [
        block.title ? `**${block.title}**` : "",
        ...block.items.map(
          (item) =>
            `${item.rank}. ${item.label}${item.reason ? ` — ${item.reason}` : ""}`,
        ),
      ]
        .filter(Boolean)
        .join("\n");
    case "status":
      return [
        block.title ? `**${block.title}**` : "",
        ...block.items.map(
          (item) =>
            `- ${item.label}: ${item.status.replace("_", " ")}${item.detail ? ` — ${item.detail}` : ""}`,
        ),
      ]
        .filter(Boolean)
        .join("\n");
    case "before_after":
      return [
        block.title ? `**${block.title}**` : "",
        `**${block.before.title || "Before"}**`,
        ...block.before.items.map((i) => `- ${i}`),
        `**${block.after.title || "After"}**`,
        ...block.after.items.map((i) => `- ${i}`),
      ]
        .filter(Boolean)
        .join("\n");
    case "faq":
      return [
        block.title ? `**${block.title}**` : "",
        ...block.items.map((item) => `**Q:** ${item.question}\n**A:** ${item.answer}`),
      ]
        .filter(Boolean)
        .join("\n\n");
    case "metric":
      return `**${block.label}:** ${block.value}${block.hint ? ` — ${block.hint}` : ""}`;
    case "insight":
      return `**${block.title}**\n${block.body}`;
    case "citation":
      return block.url ? `[${block.label}](${block.url})` : block.label;
    case "source_link":
      return `[${block.title}](${block.url})`;
    case "review_draft":
      return block.body;
    case "code":
      return `\`\`\`${block.language ?? ""}\n${block.code}\n\`\`\``;
    case "error_recovery":
      return `**${block.title}**\n${block.body}`;
    default:
      return "";
  }
}

export function richResponseToMarkdown(response: RichResponse): string {
  return response.blocks
    .map((block) => richBlockToMarkdown(block))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
