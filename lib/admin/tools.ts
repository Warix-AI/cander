/**
 * Admin chat tool registry — thin stubs that call the same admin APIs as the UI.
 * Mutations via chat deferred; keep tools read-oriented until Phase 8+.
 */

import type { AdminSection } from "@/lib/admin/sections";

export type AdminToolResult = {
  ok: boolean;
  summary: string;
  data?: unknown;
  navigateTo?: AdminSection;
  accountId?: string;
};

export type AdminToolContext = {
  fetchJson: <T>(path: string, init?: RequestInit) => Promise<T>;
  setSection: (section: AdminSection) => void;
  setSelectedAccountId: (id: string | null) => void;
};

export type AdminToolDef = {
  name: string;
  description: string;
  run: (
    args: Record<string, unknown>,
    ctx: AdminToolContext,
  ) => Promise<AdminToolResult>;
};

export const ADMIN_TOOLS: AdminToolDef[] = [
  {
    name: "listAccounts",
    description: "Search platform accounts by email or name.",
    async run(args, ctx) {
      const q = String(args.q ?? args.query ?? "").trim();
      const data = await ctx.fetchJson<{
        accounts: Array<{ id: string; email: string; name: string; plan: string }>;
      }>(`/api/admin/accounts?q=${encodeURIComponent(q)}&limit=20`);
      ctx.setSection("accounts");
      return {
        ok: true,
        summary: `Found ${data.accounts?.length ?? 0} account(s).`,
        data: data.accounts,
        navigateTo: "accounts",
      };
    },
  },
  {
    name: "openPlan",
    description: "Open the Plans section (optionally highlight a plan id).",
    async run(args, ctx) {
      ctx.setSection("plans");
      const planId = args.planId ? String(args.planId) : null;
      return {
        ok: true,
        summary: planId ? `Opened Plans (${planId}).` : "Opened Plans.",
        navigateTo: "plans",
        data: { planId },
      };
    },
  },
  {
    name: "showUsage",
    description: "Open Usage explorer, optionally for an account.",
    async run(args, ctx) {
      const accountId = args.accountId ? String(args.accountId) : null;
      if (accountId) ctx.setSelectedAccountId(accountId);
      ctx.setSection("usage");
      return {
        ok: true,
        summary: accountId
          ? `Opened Usage for ${accountId}.`
          : "Opened Usage explorer.",
        navigateTo: "usage",
        accountId: accountId ?? undefined,
      };
    },
  },
];

export function matchAdminToolIntent(text: string): {
  tool: AdminToolDef;
  args: Record<string, unknown>;
} | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  const accountMatch = t.match(
    /(?:find|list|search)\s+accounts?(?:\s+(?:for|named)?\s+(.+))?/i,
  );
  if (accountMatch || t.includes("list accounts") || t.startsWith("accounts ")) {
    const q =
      accountMatch?.[1]?.trim() ||
      (t.startsWith("accounts ") ? t.slice("accounts ".length) : "");
    return { tool: ADMIN_TOOLS[0]!, args: { q } };
  }

  if (t.includes("open plan") || t.includes("show plans") || t === "plans") {
    const planId = ["free", "pro", "max", "ultra", "enterprise"].find((p) =>
      t.includes(p),
    );
    return { tool: ADMIN_TOOLS[1]!, args: planId ? { planId } : {} };
  }

  if (t.includes("show usage") || t.includes("open usage") || t === "usage") {
    const uuid = t.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    return {
      tool: ADMIN_TOOLS[2]!,
      args: uuid ? { accountId: uuid[0] } : {},
    };
  }

  return null;
}
