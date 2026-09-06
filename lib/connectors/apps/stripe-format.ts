/**
 * Human-readable Stripe formatting for the connector panel (not agent tools).
 */

import type { AppListItem } from "./definitions.ts";

export type StripeResource =
  | "customers"
  | "invoices"
  | "charges"
  | "payment_intents"
  | "products"
  | "prices"
  | "subscriptions";

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function unwrapList(payload: Record<string, unknown>): unknown[] {
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  const data = asRecord(payload.data);
  if (data) {
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.items)) return data.items;
  }
  return [];
}

/** Stripe amounts are usually integer cents. */
export function formatStripeMoney(
  amount: unknown,
  currency: unknown = "usd",
): string {
  const n =
    typeof amount === "string" ? Number(amount) : typeof amount === "number" ? amount : NaN;
  if (!Number.isFinite(n)) return "—";
  const code =
    typeof currency === "string" && currency.trim()
      ? currency.trim().toUpperCase()
      : "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code.length === 3 ? code : "USD",
      currencyDisplay: "symbol",
    }).format(n / 100);
  } catch {
    return `${(n / 100).toFixed(2)} ${code}`;
  }
}

export function formatStripeDate(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  let ms: number;
  if (typeof value === "number") {
    ms = value > 1e12 ? value : value * 1000;
  } else if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    ms = n > 1e12 ? n : n * 1000;
  } else if (typeof value === "string") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } else {
    return undefined;
  }
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatStripeStatus(status: unknown): string {
  if (typeof status !== "string" || !status.trim()) return "Unknown";
  return status
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function shortStripeId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export type StripeBalanceLine = {
  currency: string;
  available: string;
  pending: string;
};

export function formatStripeBalance(
  payload: Record<string, unknown>,
): StripeBalanceLine[] {
  const root = asRecord(payload.data) ?? payload;
  const available = Array.isArray(root.available) ? root.available : [];
  const pending = Array.isArray(root.pending) ? root.pending : [];
  const byCurrency = new Map<
    string,
    { available: number; pending: number }
  >();

  for (const row of available) {
    const rec = asRecord(row);
    if (!rec) continue;
    const currency = pickString(rec.currency)?.toUpperCase() ?? "USD";
    const amount = typeof rec.amount === "number" ? rec.amount : 0;
    const cur = byCurrency.get(currency) ?? { available: 0, pending: 0 };
    cur.available += amount;
    byCurrency.set(currency, cur);
  }
  for (const row of pending) {
    const rec = asRecord(row);
    if (!rec) continue;
    const currency = pickString(rec.currency)?.toUpperCase() ?? "USD";
    const amount = typeof rec.amount === "number" ? rec.amount : 0;
    const cur = byCurrency.get(currency) ?? { available: 0, pending: 0 };
    cur.pending += amount;
    byCurrency.set(currency, cur);
  }

  return [...byCurrency.entries()].map(([currency, amounts]) => ({
    currency,
    available: formatStripeMoney(amounts.available, currency),
    pending: formatStripeMoney(amounts.pending, currency),
  }));
}

function customerTitle(row: Record<string, unknown>): string {
  return (
    pickString(row.name, row.email, row.description, row.id) ?? "Customer"
  );
}

function normalizeCustomer(raw: unknown): AppListItem | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = pickString(row.id);
  if (!id) return null;
  const email = pickString(row.email);
  const name = pickString(row.name);
  return {
    id,
    title: customerTitle(row),
    subtitle: email && name ? email : pickString(row.description, email, name),
    meta: formatStripeDate(row.created),
    raw: row,
  };
}

function normalizeInvoice(raw: unknown): AppListItem | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = pickString(row.id);
  if (!id) return null;
  const money = formatStripeMoney(
    row.amount_due ?? row.total ?? row.amount_paid,
    row.currency,
  );
  const status = formatStripeStatus(row.status);
  const customer = pickString(
    row.customer_name,
    row.customer_email,
    typeof row.customer === "string" ? row.customer : null,
    asRecord(row.customer)?.email,
    asRecord(row.customer)?.name,
  );
  return {
    id,
    title: `${money} · ${status}`,
    subtitle: customer ?? shortStripeId(id),
    meta: formatStripeDate(row.created ?? row.status_transitions),
    raw: row,
  };
}

function normalizeCharge(raw: unknown): AppListItem | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = pickString(row.id);
  if (!id) return null;
  const money = formatStripeMoney(row.amount, row.currency);
  const status = formatStripeStatus(row.status);
  const customer = pickString(
    row.billing_details && asRecord(row.billing_details)?.email,
    typeof row.customer === "string" ? row.customer : null,
    row.description,
  );
  return {
    id,
    title: `${money} · ${status}`,
    subtitle: customer ?? shortStripeId(id),
    meta: formatStripeDate(row.created),
    raw: row,
  };
}

function normalizePaymentIntent(raw: unknown): AppListItem | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = pickString(row.id);
  if (!id) return null;
  const money = formatStripeMoney(row.amount, row.currency);
  const status = formatStripeStatus(row.status);
  const customer = pickString(
    typeof row.customer === "string" ? row.customer : null,
    row.description,
  );
  return {
    id,
    title: `${money} · ${status}`,
    subtitle: customer ?? shortStripeId(id),
    meta: formatStripeDate(row.created),
    raw: row,
  };
}

function normalizeProduct(raw: unknown): AppListItem | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = pickString(row.id);
  if (!id) return null;
  const active =
    row.active === true ? "Active" : row.active === false ? "Inactive" : undefined;
  return {
    id,
    title: pickString(row.name, row.id) ?? "Product",
    subtitle: pickString(row.description, active),
    meta: formatStripeDate(row.created) ?? active,
    raw: row,
  };
}

function normalizePrice(raw: unknown): AppListItem | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = pickString(row.id);
  if (!id) return null;
  const unit =
    typeof row.unit_amount === "number"
      ? formatStripeMoney(row.unit_amount, row.currency)
      : pickString(row.nickname, id);
  const interval = asRecord(row.recurring);
  const cadence = interval
    ? [
        pickString(interval.interval_count) &&
        Number(interval.interval_count) > 1
          ? `every ${interval.interval_count}`
          : null,
        pickString(interval.interval),
      ]
        .filter(Boolean)
        .join(" ")
    : "One-time";
  const active =
    row.active === true ? "Active" : row.active === false ? "Inactive" : undefined;
  return {
    id,
    title: unit ?? "Price",
    subtitle: [cadence, active].filter(Boolean).join(" · ") || shortStripeId(id),
    meta: formatStripeDate(row.created),
    raw: row,
  };
}

function normalizeSubscription(raw: unknown): AppListItem | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = pickString(row.id);
  if (!id) return null;
  const status = formatStripeStatus(row.status);
  const items = asRecord(row.items);
  const data = items && Array.isArray(items.data) ? items.data : [];
  const first = asRecord(data[0]);
  const price = asRecord(first?.price);
  const product = pickString(
    asRecord(price?.product)?.name,
    typeof price?.product === "string" ? price.product : null,
    price?.nickname,
  );
  const money =
    price && typeof price.unit_amount === "number"
      ? formatStripeMoney(price.unit_amount, price.currency)
      : undefined;
  return {
    id,
    title: [product, money].filter(Boolean).join(" · ") || status,
    subtitle: status,
    meta: formatStripeDate(row.current_period_end ?? row.created),
    raw: row,
  };
}

export function normalizeStripeItems(
  resource: StripeResource,
  payload: Record<string, unknown>,
): AppListItem[] {
  const rows = unwrapList(payload);
  const out: AppListItem[] = [];
  for (const row of rows) {
    let item: AppListItem | null = null;
    switch (resource) {
      case "customers":
        item = normalizeCustomer(row);
        break;
      case "invoices":
        item = normalizeInvoice(row);
        break;
      case "charges":
        item = normalizeCharge(row);
        break;
      case "payment_intents":
        item = normalizePaymentIntent(row);
        break;
      case "products":
        item = normalizeProduct(row);
        break;
      case "prices":
        item = normalizePrice(row);
        break;
      case "subscriptions":
        item = normalizeSubscription(row);
        break;
    }
    if (item) out.push(item);
  }
  return out;
}

/** Labeled fields for detail screens (average-person copy). */
export type StripeDetailField = { label: string; value: string };

export function detailFieldsForResource(
  resource: StripeResource,
  row: Record<string, unknown>,
): StripeDetailField[] {
  const fields: StripeDetailField[] = [];
  const add = (label: string, value: string | undefined) => {
    if (value) fields.push({ label, value });
  };

  switch (resource) {
    case "customers":
      add("Name", pickString(row.name));
      add("Email", pickString(row.email));
      add("Phone", pickString(row.phone));
      add("Notes", pickString(row.description));
      add("Created", formatStripeDate(row.created));
      add("Customer ID", pickString(row.id));
      break;
    case "invoices":
      add(
        "Amount due",
        formatStripeMoney(row.amount_due ?? row.total, row.currency),
      );
      add("Status", formatStripeStatus(row.status));
      add(
        "Customer",
        pickString(
          row.customer_name,
          row.customer_email,
          typeof row.customer === "string" ? row.customer : null,
        ),
      );
      add("Invoice number", pickString(row.number));
      add("Created", formatStripeDate(row.created));
      add("Due", formatStripeDate(row.due_date));
      add("Invoice ID", pickString(row.id));
      break;
    case "charges":
      add("Amount", formatStripeMoney(row.amount, row.currency));
      add("Status", formatStripeStatus(row.status));
      add("Description", pickString(row.description));
      add(
        "Customer",
        pickString(typeof row.customer === "string" ? row.customer : null),
      );
      add("Created", formatStripeDate(row.created));
      add("Charge ID", pickString(row.id));
      break;
    case "payment_intents":
      add("Amount", formatStripeMoney(row.amount, row.currency));
      add("Status", formatStripeStatus(row.status));
      add("Description", pickString(row.description));
      add(
        "Customer",
        pickString(typeof row.customer === "string" ? row.customer : null),
      );
      add("Created", formatStripeDate(row.created));
      add("Payment ID", pickString(row.id));
      break;
    case "products":
      add("Name", pickString(row.name));
      add("Description", pickString(row.description));
      add(
        "Status",
        row.active === true
          ? "Active"
          : row.active === false
            ? "Inactive"
            : undefined,
      );
      add("Created", formatStripeDate(row.created));
      add("Product ID", pickString(row.id));
      break;
    case "prices":
      add(
        "Price",
        typeof row.unit_amount === "number"
          ? formatStripeMoney(row.unit_amount, row.currency)
          : undefined,
      );
      add("Nickname", pickString(row.nickname));
      add(
        "Billing",
        (() => {
          const interval = asRecord(row.recurring);
          if (!interval) return "One-time";
          const count = Number(interval.interval_count ?? 1);
          const unit = pickString(interval.interval) ?? "period";
          return count > 1 ? `Every ${count} ${unit}s` : `Every ${unit}`;
        })(),
      );
      add(
        "Status",
        row.active === true
          ? "Active"
          : row.active === false
            ? "Inactive"
            : undefined,
      );
      add("Price ID", pickString(row.id));
      break;
    case "subscriptions":
      add("Status", formatStripeStatus(row.status));
      add(
        "Customer",
        pickString(typeof row.customer === "string" ? row.customer : null),
      );
      add("Current period ends", formatStripeDate(row.current_period_end));
      add("Started", formatStripeDate(row.start_date ?? row.created));
      add("Subscription ID", pickString(row.id));
      break;
  }
  return fields;
}
