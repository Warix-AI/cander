/**
 * Platform Admin Cander agent — LLM + read tools over admin data surfaces.
 * Opens the matching workspace section via structured output (no chat mutations).
 */

import { Agent, Runner, tool, setDefaultOpenAIKey } from "@openai/agents";
import { resolveOpenAIModel } from "@/lib/ai/raw-openai/web-search";
import {
  ADMIN_SECTIONS,
  ADMIN_SECTION_LABELS,
  isAdminSection,
  type AdminSection,
} from "@/lib/admin/sections";
import {
  adminQueryAccount,
  adminQueryAccounts,
  adminQueryAudit,
  adminQueryEnterprise,
  adminQueryOperations,
  adminQueryOverview,
  adminQueryPlans,
  adminQueryPricing,
  adminQuerySubscriptions,
  adminQueryUsageAggregates,
  adminQueryUsageEvents,
  adminQueryUsagePeriods,
} from "@/lib/admin/query";

export type AdminAgentTurnInput = {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  currentSection?: AdminSection | null;
};

export type AdminAgentTurnResult = {
  reply: string;
  navigateTo: AdminSection | null;
  accountId: string | null;
};

const SECTION_ENUM = [...ADMIN_SECTIONS];

const INSTRUCTIONS = `You are Cander for Platform Admin — an internal operator assistant for the Cander platform (not a tenant org admin).

You answer questions about accounts, plans, pricing, usage, subscriptions, enterprise, audit, and operations by calling tools that read the same data as the right-hand admin panels. Always check with tools before giving counts or specifics — never invent numbers.

Workspace sections (open the relevant one when helpful):
${ADMIN_SECTIONS.map((id) => `- ${id}: ${ADMIN_SECTION_LABELS[id]}`).join("\n")}

Rules:
- Read-only. Do not claim you changed plans, pricing, overrides, or closed orphans — tell the operator to use the workspace panel for writes.
- Prefer get_overview for platform-wide totals ("how many accounts", "active subs").
- Prefer list_accounts / get_account for people; include email + plan when listing.
- Usage periods are calendar months; Stripe subscription_period_end is separate.
- Keep replies concise and concrete. Use short markdown lists when comparing a few rows.
- Set navigateTo to the section that best matches what you inspected (or null if none).
- Set accountId when you focused on one profile (UUID), else null.`;

const OUTPUT_SCHEMA = {
  type: "json_schema" as const,
  name: "admin_turn",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      reply: { type: "string" },
      navigateTo: {
        type: ["string", "null"],
        enum: [...SECTION_ENUM, null],
      },
      accountId: { type: ["string", "null"] },
    },
    required: ["reply", "navigateTo", "accountId"] as Array<
      "reply" | "navigateTo" | "accountId"
    >,
    additionalProperties: false as const,
  },
};

function json(data: unknown) {
  return JSON.stringify(data, null, 0);
}

function makeTools() {
  return [
    tool({
      name: "get_overview",
      description:
        "Platform overview metrics (total accounts, by plan, active subs, enterprise, usage health). Use for count questions.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
        required: [],
      },
      strict: true,
      execute: async () => json(await adminQueryOverview()),
    }),
    tool({
      name: "list_accounts",
      description: "Search/list platform accounts (email/name/plan).",
      parameters: {
        type: "object",
        properties: {
          q: {
            type: ["string", "null"],
            description: "Email or name search",
          },
          plan: {
            type: ["string", "null"],
            description: "Optional plan filter: free|pro|max|ultra|enterprise",
          },
          limit: {
            type: ["number", "null"],
            description: "Max rows (default 25)",
          },
        },
        additionalProperties: false,
        required: ["q", "plan", "limit"],
      },
      strict: true,
      execute: async (raw: unknown) => {
        const args = (raw ?? {}) as {
          q?: string | null;
          plan?: string | null;
          limit?: number | null;
        };
        return json(
          await adminQueryAccounts({
            q: args.q ?? undefined,
            plan: args.plan ?? undefined,
            limit: args.limit ?? undefined,
          }),
        );
      },
    }),
    tool({
      name: "get_account",
      description: "Fetch one account by UUID or exact email.",
      parameters: {
        type: "object",
        properties: {
          idOrEmail: { type: "string" },
        },
        required: ["idOrEmail"],
        additionalProperties: false,
      },
      strict: true,
      execute: async (raw: unknown) => {
        const args = (raw ?? {}) as { idOrEmail?: string };
        const row = await adminQueryAccount(String(args.idOrEmail ?? ""));
        return json(row ?? { error: "Account not found." });
      },
    }),
    tool({
      name: "get_plans",
      description: "AI minutes plan configs (included minutes per plan).",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
        required: [],
      },
      strict: true,
      execute: async () => json(await adminQueryPlans()),
    }),
    tool({
      name: "get_pricing",
      description: "Display pricing plans (slider/marketing SoT).",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
        required: [],
      },
      strict: true,
      execute: async () => json(await adminQueryPricing()),
    }),
    tool({
      name: "list_subscriptions",
      description: "Accounts with a non-none subscription_status.",
      parameters: {
        type: "object",
        properties: {
          status: { type: ["string", "null"] },
          limit: { type: ["number", "null"] },
        },
        additionalProperties: false,
        required: ["status", "limit"],
      },
      strict: true,
      execute: async (raw: unknown) => {
        const args = (raw ?? {}) as {
          status?: string | null;
          limit?: number | null;
        };
        return json(
          await adminQuerySubscriptions({
            status: args.status ?? undefined,
            limit: args.limit ?? undefined,
          }),
        );
      },
    }),
    tool({
      name: "list_enterprise",
      description: "Enterprise-plan accounts and overrides.",
      parameters: {
        type: "object",
        properties: { limit: { type: ["number", "null"] } },
        additionalProperties: false,
        required: ["limit"],
      },
      strict: true,
      execute: async (raw: unknown) => {
        const args = (raw ?? {}) as { limit?: number | null };
        return json(await adminQueryEnterprise(args.limit ?? 25));
      },
    }),
    tool({
      name: "get_usage_periods",
      description: "Calendar-month usage period snapshots.",
      parameters: {
        type: "object",
        properties: {
          profileId: { type: ["string", "null"] },
          limit: { type: ["number", "null"] },
        },
        additionalProperties: false,
        required: ["profileId", "limit"],
      },
      strict: true,
      execute: async (raw: unknown) => {
        const args = (raw ?? {}) as {
          profileId?: string | null;
          limit?: number | null;
        };
        return json(
          await adminQueryUsagePeriods({
            profileId: args.profileId ?? undefined,
            limit: args.limit ?? undefined,
          }),
        );
      },
    }),
    tool({
      name: "get_usage_aggregates",
      description: "Per-period minute aggregates (used vs included).",
      parameters: {
        type: "object",
        properties: {
          profileId: { type: ["string", "null"] },
          limit: { type: ["number", "null"] },
        },
        additionalProperties: false,
        required: ["profileId", "limit"],
      },
      strict: true,
      execute: async (raw: unknown) => {
        const args = (raw ?? {}) as {
          profileId?: string | null;
          limit?: number | null;
        };
        return json(
          await adminQueryUsageAggregates({
            profileId: args.profileId ?? undefined,
            limit: args.limit ?? undefined,
          }),
        );
      },
    }),
    tool({
      name: "get_usage_events",
      description: "Recent AI usage events (running/failed/etc).",
      parameters: {
        type: "object",
        properties: {
          profileId: { type: ["string", "null"] },
          status: { type: ["string", "null"] },
          limit: { type: ["number", "null"] },
        },
        additionalProperties: false,
        required: ["profileId", "status", "limit"],
      },
      strict: true,
      execute: async (raw: unknown) => {
        const args = (raw ?? {}) as {
          profileId?: string | null;
          status?: string | null;
          limit?: number | null;
        };
        return json(
          await adminQueryUsageEvents({
            profileId: args.profileId ?? undefined,
            status: args.status ?? undefined,
            limit: args.limit ?? undefined,
          }),
        );
      },
    }),
    tool({
      name: "get_audit_log",
      description: "Recent platform admin audit entries.",
      parameters: {
        type: "object",
        properties: { limit: { type: ["number", "null"] } },
        additionalProperties: false,
        required: ["limit"],
      },
      strict: true,
      execute: async (raw: unknown) => {
        const args = (raw ?? {}) as { limit?: number | null };
        return json(await adminQueryAudit(args.limit ?? 25));
      },
    }),
    tool({
      name: "get_operations",
      description:
        "Ops health: orphan running events, recent failures, over-minute accounts.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
        required: [],
      },
      strict: true,
      execute: async () => json(await adminQueryOperations()),
    }),
  ];
}

let keyConfigured = false;

export async function runAdminAgentTurn(
  input: AdminAgentTurnInput,
): Promise<AdminAgentTurnResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured.");
  if (!keyConfigured) {
    setDefaultOpenAIKey(apiKey);
    keyConfigured = true;
  }

  const sectionHint = input.currentSection
    ? `Operator is currently viewing the "${input.currentSection}" panel (${ADMIN_SECTION_LABELS[input.currentSection]}).`
    : "No panel is focused yet.";

  const agent = new Agent({
    name: "Cander Admin",
    instructions: `${INSTRUCTIONS}\n\n${sectionHint}`,
    model: resolveOpenAIModel(),
    modelSettings: { store: true, reasoning: { effort: "low" } },
    tools: makeTools(),
    outputType: OUTPUT_SCHEMA,
  });

  const history = (input.history ?? [])
    .filter((m) => m.content?.trim())
    .slice(-12)
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, 2000),
    }));

  const runner = new Runner({
    workflowName: "cander.admin_turn",
    groupId: "platform-admin",
  });

  const result = await runner.run(
    agent,
    [
      ...history.map((m) =>
        m.role === "user"
          ? ({ role: "user" as const, content: m.content })
          : ({
              role: "assistant" as const,
              status: "completed" as const,
              content: [{ type: "output_text" as const, text: m.content }],
            }),
      ),
      { role: "user" as const, content: input.message },
    ],
    { maxTurns: 10 },
  );

  const out = result.finalOutput as
    | Partial<AdminAgentTurnResult>
    | string
    | undefined;
  const parsed: Partial<AdminAgentTurnResult> =
    typeof out === "string"
      ? (safeParse(out) ?? { reply: out })
      : (out ?? {});

  const navigateTo = isAdminSection(parsed.navigateTo)
    ? parsed.navigateTo
    : null;
  const accountId =
    typeof parsed.accountId === "string" && parsed.accountId.trim()
      ? parsed.accountId.trim()
      : null;

  return {
    reply:
      String(parsed.reply ?? "").trim() ||
      "I looked, but have nothing useful to report yet.",
    navigateTo,
    accountId,
  };
}

function safeParse(text: string): Partial<AdminAgentTurnResult> | null {
  try {
    return JSON.parse(text) as Partial<AdminAgentTurnResult>;
  } catch {
    return null;
  }
}
