/**
 * Seams for future token streaming (Edge SSE → client).
 * Live path remains request/replace via /v1/chat.
 */
export type StreamDelta =
  | { type: "status"; status: "pending" | "streaming" | "complete" | "error" }
  | { type: "token"; text: string }
  | { type: "tool"; label: string; status: "running" | "done" | "error" }
  | { type: "done"; content: string; condensationOccurred?: boolean }
  | { type: "error"; message: string };
