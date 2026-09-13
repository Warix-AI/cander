/**
 * Email confirmation helpers for signup / onboarding gate.
 * Run: node --experimental-strip-types --test scripts/email-confirmed.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { User } from "@supabase/supabase-js";
import { isAuthEmailConfirmed } from "../lib/auth/email-confirmed.ts";

function user(partial: Partial<User> & { email?: string | null }): User {
  return partial as User;
}

describe("isAuthEmailConfirmed", () => {
  it("rejects missing user", () => {
    assert.equal(isAuthEmailConfirmed(null), false);
    assert.equal(isAuthEmailConfirmed(undefined), false);
  });

  it("rejects user without email", () => {
    assert.equal(
      isAuthEmailConfirmed(user({ email: null, email_confirmed_at: "2026-01-01" })),
      false,
    );
  });

  it("rejects unconfirmed email", () => {
    assert.equal(
      isAuthEmailConfirmed(
        user({ email: "a@example.com", email_confirmed_at: null }),
      ),
      false,
    );
  });

  it("accepts confirmed email", () => {
    assert.equal(
      isAuthEmailConfirmed(
        user({
          email: "a@example.com",
          email_confirmed_at: "2026-09-12T12:00:00Z",
        }),
      ),
      true,
    );
  });
});
