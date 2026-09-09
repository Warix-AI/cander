/**
 * Lightweight Supabase egress instrumentation (dev / dogfood).
 * Logs route/query name, selected columns, approximate response size, and call frequency.
 * No-ops in production unless CANDER_SUPABASE_EGRESS_LOG=1.
 */

type EgressSample = {
  count: number;
  bytes: number;
  lastAt: number;
};

const globalKey = "__cander_supabase_egress__";

function store(): Map<string, EgressSample> {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: Map<string, EgressSample>;
  };
  if (!g[globalKey]) g[globalKey] = new Map();
  return g[globalKey]!;
}

function enabled(): boolean {
  if (process.env.CANDER_SUPABASE_EGRESS_LOG === "1") return true;
  return process.env.NODE_ENV !== "production";
}

export function noteSupabaseEgress(opts: {
  route: string;
  columns: string;
  rowCount?: number;
  approxBytes?: number;
}): void {
  if (!enabled()) return;
  const key = `${opts.route}|${opts.columns}`;
  const map = store();
  const prev = map.get(key) || { count: 0, bytes: 0, lastAt: 0 };
  const bytes =
    opts.approxBytes ??
    Math.max(0, (opts.rowCount ?? 0) * Math.max(64, opts.columns.length * 4));
  const next = {
    count: prev.count + 1,
    bytes: prev.bytes + bytes,
    lastAt: Date.now(),
  };
  map.set(key, next);
  // Throttle console: log every call in first 3, then every 10th.
  if (next.count <= 3 || next.count % 10 === 0) {
    console.info("[cander:egress]", {
      route: opts.route,
      columns: opts.columns,
      calls: next.count,
      approxBytesTotal: next.bytes,
      rowCount: opts.rowCount,
    });
  }
}

/** Entity list columns — exclude Build jsonb manifests / brief / sandbox blobs. */
export const PROJECT_ENTITY_COLUMNS = [
  "id",
  "workspace_id",
  "space_id",
  "title",
  "summary",
  "cover",
  "kind",
  "status",
  "instructions",
  "thread_id",
  "published_url",
  "domains",
  "version",
  "created_at",
  "updated_at",
  "created_by",
].join(", ");

export const COMPUTER_SESSION_STATUS_COLUMNS = [
  "id",
  "user_id",
  "scope_type",
  "scope_id",
  "project_id",
  "workspace_id",
  "status",
  "stream_url",
  "build_state",
  "provider",
  "provider_session_id",
  "control_mode",
  "current_url",
  "created_at",
  "last_active_at",
  "expires_at",
].join(", ");
