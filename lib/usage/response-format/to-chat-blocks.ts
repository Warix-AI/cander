/**
 * Map validated rich response blocks onto existing ChatBlock union where possible.
 */
import type { ChatBlock } from "../../types.ts";
import type { RichResponseBlockV2, RichResponseV2 } from "./schema-v2.ts";

export function richBlocksToChatBlocks(response: RichResponseV2): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  for (const block of response.blocks) {
    switch (block.type) {
      case "text":
        blocks.push({ type: "text", text: block.text });
        break;
      case "markdown":
        blocks.push({ type: "text", text: block.markdown });
        break;
      case "heading":
        blocks.push({
          type: "text",
          text: `${"#".repeat(block.level)} ${block.text}`,
        });
        break;
      case "callout":
        blocks.push({
          type: "text",
          text: block.title
            ? `**${block.title}**\n\n${block.body}`
            : block.body,
        });
        break;
      case "summary":
        blocks.push({
          type: "text",
          text: block.title ? `**${block.title}**\n\n${block.body}` : block.body,
        });
        break;
      case "table":
        blocks.push({
          type: "text",
          text: [
            `| ${block.columns.join(" | ")} |`,
            `| ${block.columns.map(() => "---").join(" | ")} |`,
            ...block.rows.map((row) => `| ${row.join(" | ")} |`),
          ].join("\n"),
        });
        break;
      case "comparison_card":
        blocks.push({
          type: "text",
          text: [
            block.title ? `**${block.title}**` : "",
            `| | ${block.columns.join(" | ")} |`,
            `| --- | ${block.columns.map(() => "---").join(" | ")} |`,
            ...block.rows.map(
              (row) => `| ${row.label} | ${row.values.join(" | ")} |`,
            ),
          ]
            .filter(Boolean)
            .join("\n"),
        });
        break;
      case "metric":
        blocks.push({
          type: "text",
          text: `**${block.label}:** ${block.value}${block.hint ? ` — ${block.hint}` : ""}`,
        });
        break;
      case "insight":
        blocks.push({
          type: "text",
          text: `**${block.title}**\n\n${block.body}`,
        });
        break;
      case "citation":
        blocks.push({
          type: "text",
          text: block.url
            ? `[${block.label}](${block.url})`
            : block.label,
        });
        break;
      case "source_link":
        blocks.push({
          type: "text",
          text: `[${block.title}](${block.url})`,
        });
        break;
      case "code":
        blocks.push({
          type: "text",
          text: `\`\`\`${block.language ?? ""}\n${block.code}\n\`\`\``,
        });
        break;
      case "review_draft":
        blocks.push({
          type: "text",
          text: block.body,
        });
        break;
      case "follow_up":
        blocks.push({
          type: "suggestions",
          prompt: block.prompt,
          actions: block.options.map((option) => ({
            id: option.id,
            label: option.label,
          })),
        });
        break;
      case "numbered_steps":
        blocks.push({
          type: "plan",
          title: "Steps",
          steps: block.steps,
        });
        break;
      case "checklist":
        blocks.push({
          type: "plan",
          title: "Checklist",
          steps: block.items.map(
            (item) => `${item.done ? "[x]" : "[ ]"} ${item.label}`,
          ),
        });
        break;
      case "image_result":
        blocks.push({
          type: "image",
          url: block.url,
          name: block.alt ?? "Generated image",
          mime: "image/png",
        });
        break;
      case "job_progress":
        blocks.push({
          type: "tool",
          label: block.title,
          status:
            block.status === "completed"
              ? "done"
              : block.status === "failed"
                ? "error"
                : "running",
          detail: block.detail,
        });
        break;
      case "approval":
        blocks.push({
          type: "suggestions",
          prompt: block.body,
          actions: [{ id: block.actionId, label: block.actionLabel }],
        });
        break;
      case "error_recovery":
        blocks.push({
          type: "error",
          title: block.title,
          body: block.body,
        });
        break;
      case "sandbox_preview":
        blocks.push({
          type: "deploy",
          url: block.previewUrl,
          status: block.status === "ready" ? "ready" : "live",
        });
        break;
      default:
        blocks.push({ type: "text", text: JSON.stringify(block) });
        break;
    }
  }
  return blocks;
}

export function isRichResponsePayload(raw: unknown): raw is RichResponseV2 {
  return (
    !!raw &&
    typeof raw === "object" &&
    Number((raw as { version?: unknown }).version) === 2 &&
    Array.isArray((raw as { blocks?: unknown }).blocks)
  );
}

export type { RichResponseBlockV2 };
