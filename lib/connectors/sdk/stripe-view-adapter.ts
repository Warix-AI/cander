/**
 * Stripe connector panel — multi-resource view adapter.
 */

import { executeConnectorTool } from "../tool-execute.ts";
import { createSupabaseAdminClient } from "../../supabase/admin.ts";
import {
  formatStripeBalance,
  normalizeStripeItems,
  type StripeResource,
  type StripeBalanceLine,
} from "../apps/stripe-format.ts";
import type {
  ActionContext,
  ActionResult,
  ConnectorViewAdapter,
  SyncContext,
  SyncResult,
} from "./types.ts";

const RESOURCES = new Set<StripeResource>([
  "customers",
  "invoices",
  "charges",
  "payment_intents",
  "products",
  "prices",
  "subscriptions",
]);

function parseToolJson(output: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function asResource(value: unknown): StripeResource | null {
  if (typeof value !== "string") return null;
  return RESOURCES.has(value as StripeResource)
    ? (value as StripeResource)
    : null;
}

async function runTool(
  ctx: ActionContext | SyncContext,
  tool: string,
  args: Record<string, unknown>,
  confirmed = false,
) {
  const admin = createSupabaseAdminClient();
  return executeConnectorTool({
    client: admin,
    workspaceId: ctx.workspaceId,
    profileId: ctx.profileId,
    tool,
    arguments: args,
    connectionId: ctx.connectionId,
    confirmed,
  });
}

function toolForResource(resource: StripeResource): string {
  switch (resource) {
    case "customers":
      return "stripe.list";
    case "invoices":
      return "stripe.listInvoices";
    case "charges":
      return "stripe.listCharges";
    case "payment_intents":
      return "stripe.listPaymentIntents";
    case "products":
      return "stripe.listProducts";
    case "prices":
      return "stripe.listPrices";
    case "subscriptions":
      return "stripe.listSubscriptions";
  }
}

export const stripeViewAdapter: ConnectorViewAdapter = {
  connectorId: "stripe",
  capabilities: {
    sync: false,
    list: true,
  },

  async sync(_ctx: SyncContext): Promise<SyncResult> {
    return { upserted: [], cursor: null, providerState: {} };
  },

  async executeAction(
    action: string,
    input: unknown,
    ctx: ActionContext,
  ): Promise<ActionResult> {
    const args =
      input && typeof input === "object"
        ? (input as Record<string, unknown>)
        : {};

    try {
      if (action === "listItems") {
        const resource = asResource(args.resource) ?? "customers";
        if (resource === "subscriptions") {
          const customer = pickString(args.customer, args.customer_id);
          if (!customer) {
            return {
              ok: false,
              error: "Pick a customer to see their subscriptions.",
            };
          }
          const result = await runTool(ctx, "stripe.listSubscriptions", {
            customer,
            limit: typeof args.limit === "number" ? args.limit : 40,
          });
          if (!result.ok) return { ok: false, error: result.error };
          const payload = parseToolJson(result.output);
          return {
            ok: true,
            data: {
              items: normalizeStripeItems("subscriptions", payload),
              raw: payload,
            },
          };
        }

        const listArgs: Record<string, unknown> = {
          limit: typeof args.limit === "number" ? args.limit : 40,
        };
        if (resource === "customers") {
          const query = pickString(args.query);
          if (query) listArgs.query = query;
        }
        if (resource === "prices") {
          const product = pickString(args.product, args.product_id);
          if (product) listArgs.product = product;
        }
        if (resource === "invoices" || resource === "charges" || resource === "payment_intents") {
          const customer = pickString(args.customer, args.customer_id);
          if (customer) listArgs.customer = customer;
        }
        if (resource === "invoices") {
          const status = pickString(args.status);
          if (status) listArgs.status = status;
        }

        const result = await runTool(ctx, toolForResource(resource), listArgs);
        if (!result.ok) return { ok: false, error: result.error };
        const payload = parseToolJson(result.output);
        return {
          ok: true,
          data: {
            items: normalizeStripeItems(resource, payload),
            raw: payload,
          },
        };
      }

      if (action === "getItem") {
        const resource = asResource(args.resource) ?? "customers";
        if (resource !== "customers") {
          return {
            ok: false,
            error: "Open this item from the list for details.",
          };
        }
        const id = pickString(args.id, args.customer_id);
        if (!id) return { ok: false, error: "Missing customer id." };
        const result = await runTool(ctx, "stripe.get", { id });
        if (!result.ok) return { ok: false, error: result.error };
        return { ok: true, data: parseToolJson(result.output) };
      }

      if (action === "retrieveBalance") {
        const result = await runTool(ctx, "stripe.retrieveBalance", {});
        if (!result.ok) return { ok: false, error: result.error };
        const payload = parseToolJson(result.output);
        const lines: StripeBalanceLine[] = formatStripeBalance(payload);
        return {
          ok: true,
          data: {
            lines,
            raw: payload,
          },
        };
      }

      if (action === "createCustomer") {
        const name = pickString(args.name);
        const email = pickString(args.email);
        const phone = pickString(args.phone);
        const description = pickString(args.description);
        if (!name && !email) {
          return {
            ok: false,
            error: "Add a name or email for the customer.",
          };
        }
        const result = await runTool(
          ctx,
          "stripe.createCustomer",
          {
            ...(name ? { name } : {}),
            ...(email ? { email } : {}),
            ...(phone ? { phone } : {}),
            ...(description ? { description } : {}),
          },
          true,
        );
        if (!result.ok) return { ok: false, error: result.error };
        return { ok: true, data: parseToolJson(result.output) };
      }

      return { ok: false, error: `Unsupported action: ${action}` };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Operation failed.",
      };
    }
  },
};
