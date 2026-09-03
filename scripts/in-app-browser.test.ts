import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "..");

function readRepo(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("in-app citation browser", () => {
  it("opens http sources in the in-app browser, not a new OS tab", () => {
    const chat = readRepo("components/chat/AssistantMessage.tsx");
    const app = readRepo("components/app/AppProvider.tsx");
    const helper = readRepo("lib/open-in-app-browser.ts");
    assert.match(chat, /openInAppBrowser/);
    assert.doesNotMatch(chat, /target="_blank"/);
    assert.match(app, /openUrlInProjectBrowser/);
    assert.match(app, /openUrlInStandaloneBrowser/);
    assert.match(app, /beginQuickSearchBrowserSession/);
    assert.match(helper, /nextBrowserSessionForUrl/);
  });

  it("lets space chats overlay the right-panel browser when there is no project", () => {
    const src = readRepo("lib/right-panel.ts");
    assert.match(
      src,
      /opts\.view === "space" && Boolean\(opts\.spaceId\) && !opts\.projectId/,
    );
  });
});
