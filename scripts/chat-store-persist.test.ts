import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estimateThreadsJsonBytes,
  stripThreadsForLocalStorage,
} from "../lib/chat-store-persist.ts";
import type { Thread } from "../lib/types.ts";

describe("chat store persistence", () => {
  it("strips image data URLs before localStorage", () => {
    const threads: Thread[] = [
      {
        id: "t1",
        title: "Photo",
        workspaceId: "ws",
        updatedAt: "2026-01-01",
        snippet: "hi",
        messages: [
          {
            id: "m1",
            role: "user",
            content: "look",
            at: "2026-01-01",
            blocks: [
              {
                type: "image",
                name: "photo.jpeg",
                url: "data:image/jpeg;base64,QUJDREVGR0g=",
                mime: "image/jpeg",
              },
            ],
          },
        ],
      },
    ];
    const stripped = stripThreadsForLocalStorage(threads);
    const block = stripped[0]?.messages[0]?.blocks?.[0];
    assert.equal(block?.type, "image");
    if (block?.type === "image") assert.equal(block.url, "");
    assert.ok(
      estimateThreadsJsonBytes(stripped) <
        estimateThreadsJsonBytes(threads),
    );
  });
});
