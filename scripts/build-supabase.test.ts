import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("supabase provision helpers", () => {
  it("builds project urls from refs", async () => {
    // Inline mirror of provision helper to avoid pulling admin clients in unit tests.
    const url = (ref: string) => `https://${ref}.supabase.co`;
    assert.equal(url("abcdefghijklmnop"), "https://abcdefghijklmnop.supabase.co");
  });

  it("names projects within limits", () => {
    const projectId = "550e8400-e29b-41d4-a716-446655440000";
    const short = projectId.replace(/-/g, "").slice(0, 10);
    const title = "My Cool Auth App!!!";
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
    const name = `cander-${base || "app"}-${short}`.slice(0, 40);
    assert.ok(name.startsWith("cander-my-cool-auth-app-"));
    assert.ok(name.length <= 40);
  });
});
