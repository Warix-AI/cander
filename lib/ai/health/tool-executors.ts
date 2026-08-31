/**
 * Health tool executors — ephemeral aggregation results only.
 */

import { getNativeCapabilities } from "../../native/index.ts";
import type { HealthMetric } from "../../native/types.ts";
import type { AiToolCallResult } from "../runtime/tools.ts";

const METRICS = new Set<string>([
  "steps",
  "workouts",
  "activeEnergy",
  "restingHeartRate",
  "sleep",
]);

function asMetric(raw: unknown): HealthMetric | null {
  const s = String(raw || "");
  if (METRICS.has(s)) return s as HealthMetric;
  if (s === "stepCount") return "steps";
  return null;
}

export async function executeHealthTool(call: {
  name: string;
  args: Record<string, unknown>;
}): Promise<AiToolCallResult | null> {
  if (!call.name.startsWith("health.")) return null;

  const health = getNativeCapabilities().health;
  if (!health) {
    return {
      name: call.name,
      ok: false,
      output: JSON.stringify({
        outcome: "unavailable",
        message: "Available on iPhone",
      }),
    };
  }

  if (call.name === "health.query") {
    const metric = asMetric(call.args.metric);
    if (!metric) {
      return {
        name: call.name,
        ok: false,
        output: "Unknown metric. Use steps|workouts|activeEnergy|restingHeartRate|sleep",
      };
    }
    const result = await health.query({
      metric,
      start: String(call.args.start),
      end: String(call.args.end),
      aggregation:
        call.args.aggregation === "average" || call.args.aggregation === "count"
          ? call.args.aggregation
          : "sum",
    });
    // Discard raw samples — result is already aggregated
    return {
      name: call.name,
      ok:
        result.outcome === "succeeded_with_data" ||
        result.outcome === "succeeded_no_visible_data",
      output: JSON.stringify(result),
      data: result as unknown as Record<string, unknown>,
    };
  }

  if (call.name === "health.compare") {
    const metric = asMetric(call.args.metric);
    if (!metric) {
      return {
        name: call.name,
        ok: false,
        output: "Unknown metric",
      };
    }
    const periodA = call.args.periodA as { start?: string; end?: string } | undefined;
    const periodB = call.args.periodB as { start?: string; end?: string } | undefined;
    if (!periodA?.start || !periodA?.end || !periodB?.start || !periodB?.end) {
      return {
        name: call.name,
        ok: false,
        output: "periodA and periodB with start/end are required",
      };
    }
    const result = await health.compare({
      metric,
      periodA: { start: periodA.start, end: periodA.end },
      periodB: { start: periodB.start, end: periodB.end },
      aggregation:
        call.args.aggregation === "average" || call.args.aggregation === "count"
          ? call.args.aggregation
          : "sum",
    });
    return {
      name: call.name,
      ok:
        result.outcome === "succeeded_with_data" ||
        result.outcome === "succeeded_no_visible_data",
      output: JSON.stringify(result),
      data: result as unknown as Record<string, unknown>,
    };
  }

  if (call.name === "health.workouts") {
    const result = await health.workouts({
      start: String(call.args.start),
      end: String(call.args.end),
    });
    return {
      name: call.name,
      ok:
        result.outcome === "succeeded_with_data" ||
        result.outcome === "succeeded_no_visible_data",
      output: JSON.stringify(result),
      data: result as unknown as Record<string, unknown>,
    };
  }

  return null;
}
