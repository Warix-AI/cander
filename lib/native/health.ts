/**
 * NativeHealth — iOS HealthKit POC (flagged). Aggregated metrics only.
 */

import { isHealthKitFlagEnabled } from "./flags.ts";
import { getDeviceCapabilities } from "./device.ts";
import type {
  AvailabilityResult,
  HealthConnectorState,
  HealthMetric,
  HealthMetricResult,
  HealthQueryOutcome,
  HealthWorkoutSummary,
} from "./types.ts";

const HEALTH_PREF_KEY = "cander.healthEnabled";
const HEALTH_AUTH_COMPLETED_KEY = "cander.healthAuthRequestCompleted";

const POC_METRICS: HealthMetric[] = [
  "steps",
  "workouts",
  "activeEnergy",
  "restingHeartRate",
  "sleep",
];

export type NativeHealth = {
  availability(): AvailabilityResult;
  getConnectorState(): HealthConnectorState;
  isLocallyEnabled(): boolean;
  /** Connect: request HK auth + set local pref. */
  connect(): Promise<HealthConnectorState>;
  /** Disconnect in Cander only — does not revoke HK grants. */
  disconnect(): void;
  openSystemHealthSettings(): Promise<{ ok: boolean }>;
  query(opts: {
    metric: HealthMetric;
    start: string;
    end: string;
    aggregation?: "sum" | "average" | "count";
  }): Promise<HealthMetricResult>;
  compare(opts: {
    metric: HealthMetric;
    periodA: { start: string; end: string };
    periodB: { start: string; end: string };
    aggregation?: "sum" | "average" | "count";
  }): Promise<{
    current: HealthMetricResult;
    previous: HealthMetricResult;
    delta: number | null;
    percentDelta: number | null;
    outcome: HealthQueryOutcome;
  }>;
  workouts(opts: {
    start: string;
    end: string;
  }): Promise<{
    outcome: HealthQueryOutcome;
    workouts: HealthWorkoutSummary[];
    error?: string;
  }>;
};

type CapHealthPlugin = {
  getAvailability?: () => Promise<{
    available: boolean;
    reason?: string;
    message?: string;
  }>;
  requestAuthorization?: (opts: {
    readTypes: string[];
  }) => Promise<{ completed: boolean }>;
  queryStatistic?: (opts: {
    metric: string;
    start: string;
    end: string;
    aggregation: string;
  }) => Promise<{
    value: number | null;
    unit: string;
    sampleCount: number;
    coverage: "available" | "none_visible";
  }>;
  queryWorkouts?: (opts: {
    start: string;
    end: string;
  }) => Promise<{
    workouts: Array<{
      id: string;
      activityType: string;
      start: string;
      end: string;
      durationMinutes: number;
      activeEnergyKcal?: number;
    }>;
  }>;
  openHealthSettings?: () => Promise<{ ok: boolean }>;
};

function getCapHealth(): CapHealthPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as Window & {
      Capacitor?: { Plugins?: { CanderHealthKit?: CapHealthPlugin } };
    }
  ).Capacitor;
  return cap?.Plugins?.CanderHealthKit ?? null;
}

function readPref(key: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writePref(key: string, on: boolean) {
  if (typeof localStorage === "undefined") return;
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function unavailableResult(
  metric: HealthMetric,
  start: string,
  end: string,
  outcome: HealthQueryOutcome,
  error?: string,
): HealthMetricResult {
  return {
    metric,
    period: { start, end },
    value: null,
    unit: "",
    sampleCount: 0,
    coverage: "none_visible",
    outcome,
    error,
  };
}

export function createNativeHealth(): NativeHealth | undefined {
  const caps = getDeviceCapabilities();
  if (!caps.healthKit.available && !isHealthKitFlagEnabled()) {
    // Still expose a stub on non-iOS so Connectors can show "Available on iPhone"
    // when flag is on.
  }

  return {
    availability() {
      return getDeviceCapabilities().healthKit;
    },

    getConnectorState(): HealthConnectorState {
      const avail = getDeviceCapabilities().healthKit.available;
      return {
        available: avail,
        authorizationRequestCompleted: readPref(HEALTH_AUTH_COMPLETED_KEY),
        requestedTypes: [...POC_METRICS],
      };
    },

    isLocallyEnabled() {
      return readPref(HEALTH_PREF_KEY) && isHealthKitFlagEnabled();
    },

    async connect() {
      writePref(HEALTH_PREF_KEY, true);
      const plugin = getCapHealth();
      if (plugin?.requestAuthorization) {
        try {
          await plugin.requestAuthorization({
            readTypes: [...POC_METRICS],
          });
        } catch {
          // Pref stays on; auth may be incomplete — never invent grant status
        }
      }
      writePref(HEALTH_AUTH_COMPLETED_KEY, true);
      return this.getConnectorState();
    },

    disconnect() {
      writePref(HEALTH_PREF_KEY, false);
      // Do not clear authCompleted — Apple grants remain; we just stop exposing tools
    },

    async openSystemHealthSettings() {
      const plugin = getCapHealth();
      if (plugin?.openHealthSettings) {
        return plugin.openHealthSettings();
      }
      return { ok: false };
    },

    async query(opts) {
      const start = opts.start;
      const end = opts.end;
      if (!isHealthKitFlagEnabled()) {
        return unavailableResult(
          opts.metric,
          start,
          end,
          "unavailable",
          "feature_disabled",
        );
      }
      if (!getDeviceCapabilities().healthKit.available) {
        return unavailableResult(
          opts.metric,
          start,
          end,
          "unavailable",
          "Available on iPhone",
        );
      }
      if (!this.isLocallyEnabled()) {
        return unavailableResult(
          opts.metric,
          start,
          end,
          "not_requested",
          "Connect Apple Health in Connectors to query personal metrics.",
        );
      }
      if (!readPref(HEALTH_AUTH_COMPLETED_KEY)) {
        return unavailableResult(opts.metric, start, end, "not_requested");
      }

      const plugin = getCapHealth();
      if (!plugin?.queryStatistic) {
        return unavailableResult(
          opts.metric,
          start,
          end,
          "failed",
          "HealthKit plugin unavailable",
        );
      }

      try {
        const res = await plugin.queryStatistic({
          metric: opts.metric,
          start,
          end,
          aggregation: opts.aggregation ?? "sum",
        });
        const outcome: HealthQueryOutcome =
          res.coverage === "available" && res.value != null
            ? "succeeded_with_data"
            : "succeeded_no_visible_data";
        // Never map empty → permission denied
        return {
          metric: opts.metric,
          period: { start, end },
          value: res.value,
          unit: res.unit,
          sampleCount: res.sampleCount,
          coverage: res.coverage,
          outcome,
        };
      } catch (e) {
        return unavailableResult(
          opts.metric,
          start,
          end,
          "failed",
          e instanceof Error ? e.message : "query_failed",
        );
      }
    },

    async compare(opts) {
      const current = await this.query({
        metric: opts.metric,
        start: opts.periodA.start,
        end: opts.periodA.end,
        aggregation: opts.aggregation,
      });
      const previous = await this.query({
        metric: opts.metric,
        start: opts.periodB.start,
        end: opts.periodB.end,
        aggregation: opts.aggregation,
      });
      let delta: number | null = null;
      let percentDelta: number | null = null;
      if (current.value != null && previous.value != null) {
        delta = current.value - previous.value;
        if (previous.value !== 0) {
          percentDelta = (delta / previous.value) * 100;
        }
      }
      const outcome: HealthQueryOutcome =
        current.outcome === "failed" || previous.outcome === "failed"
          ? "failed"
          : current.outcome === "unavailable" ||
              previous.outcome === "unavailable"
            ? "unavailable"
            : current.outcome === "not_requested" ||
                previous.outcome === "not_requested"
              ? "not_requested"
              : current.coverage === "available" ||
                  previous.coverage === "available"
                ? "succeeded_with_data"
                : "succeeded_no_visible_data";
      return { current, previous, delta, percentDelta, outcome };
    },

    async workouts(opts) {
      if (!isHealthKitFlagEnabled() || !getDeviceCapabilities().healthKit.available) {
        return {
          outcome: "unavailable" as const,
          workouts: [],
          error: "Available on iPhone",
        };
      }
      if (!this.isLocallyEnabled()) {
        return {
          outcome: "not_requested" as const,
          workouts: [],
          error: "Connect Apple Health in Connectors.",
        };
      }
      const plugin = getCapHealth();
      if (!plugin?.queryWorkouts) {
        return {
          outcome: "failed" as const,
          workouts: [],
          error: "HealthKit plugin unavailable",
        };
      }
      try {
        const res = await plugin.queryWorkouts(opts);
        return {
          outcome:
            res.workouts.length > 0
              ? ("succeeded_with_data" as const)
              : ("succeeded_no_visible_data" as const),
          workouts: res.workouts,
        };
      } catch (e) {
        return {
          outcome: "failed" as const,
          workouts: [],
          error: e instanceof Error ? e.message : "query_failed",
        };
      }
    },
  };
}

export { POC_METRICS, HEALTH_PREF_KEY };
