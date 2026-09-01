import type {
  UsageEventStatus,
  UsageFeatureCategory,
  UsageReconcileInput,
  UsageUnitKind,
  UsageWindowKind,
} from "../types.ts";

export type StoredUsageEvent = {
  id: string;
  idempotencyKey: string;
  workspaceId: string;
  profileId: string;
  feature: UsageFeatureCategory;
  provider: string | null;
  model: string | null;
  units: number;
  unitKind: UsageUnitKind;
  estimatedCostMicros: number;
  actualCostMicros: number | null;
  status: UsageEventStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WindowCounter = {
  requestCount: number;
  units: number;
  costMicros: number;
};

export type UsageAuditEntry = {
  id: string;
  workspaceId: string | null;
  profileId: string | null;
  feature: UsageFeatureCategory | null;
  decision: string;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ReserveUsageInput = {
  idempotencyKey: string;
  workspaceId: string;
  profileId: string;
  feature: UsageFeatureCategory;
  provider?: string | null;
  model?: string | null;
  units: number;
  unitKind: UsageUnitKind;
  estimatedCostMicros: number;
  metadata?: Record<string, unknown>;
};

export interface UsageStore {
  reserve(input: ReserveUsageInput): Promise<StoredUsageEvent>;
  reconcile(input: UsageReconcileInput): Promise<StoredUsageEvent | null>;
  getWindowCounter(input: {
    workspaceId: string;
    profileId: string | null;
    feature: UsageFeatureCategory;
    windowKind: UsageWindowKind;
    windowStart: string;
  }): Promise<WindowCounter>;
  incrementWindowCounter(input: {
    workspaceId: string;
    profileId: string | null;
    feature: UsageFeatureCategory;
    windowKind: UsageWindowKind;
    windowStart: string;
    requestDelta?: number;
    unitsDelta?: number;
    costMicrosDelta?: number;
  }): Promise<WindowCounter>;
  countActiveReservations(input: {
    workspaceId: string;
    feature: UsageFeatureCategory;
  }): Promise<number>;
  sumWorkspaceCost(input: {
    workspaceId: string;
    windowKind: UsageWindowKind;
    windowStart: string;
  }): Promise<number>;
  sumUserExpensiveCost(input: {
    profileId: string;
    windowKind: UsageWindowKind;
    windowStart: string;
  }): Promise<number>;
  sumGlobalCost(input: {
    windowKind: UsageWindowKind;
    windowStart: string;
  }): Promise<number>;
  writeAudit(entry: Omit<UsageAuditEntry, "id" | "createdAt">): Promise<void>;
}

export class MemoryUsageStore implements UsageStore {
  private events = new Map<string, StoredUsageEvent>();
  private counters = new Map<string, WindowCounter>();
  private audits: UsageAuditEntry[] = [];

  async reserve(input: ReserveUsageInput): Promise<StoredUsageEvent> {
    const key = `${input.workspaceId}|${input.idempotencyKey}`;
    const existing = this.events.get(key);
    if (existing) return existing;

    const now = new Date().toISOString();
    const event: StoredUsageEvent = {
      id: crypto.randomUUID(),
      idempotencyKey: input.idempotencyKey,
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      feature: input.feature,
      provider: input.provider ?? null,
      model: input.model ?? null,
      units: input.units,
      unitKind: input.unitKind,
      estimatedCostMicros: input.estimatedCostMicros,
      actualCostMicros: null,
      status: "reserved",
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.events.set(key, event);
    return event;
  }

  async reconcile(input: UsageReconcileInput): Promise<StoredUsageEvent | null> {
    const event = [...this.events.values()].find((e) => e.id === input.reservationId);
    if (!event) return null;
    event.status = input.status;
    event.actualCostMicros =
      input.actualCostMicros ?? event.estimatedCostMicros;
    if (typeof input.actualUnits === "number") {
      event.units = input.actualUnits;
    }
    if (input.provider) event.provider = input.provider;
    if (input.model) event.model = input.model;
    event.metadata = { ...event.metadata, ...(input.metadata ?? {}) };
    event.updatedAt = new Date().toISOString();
    return event;
  }

  async getWindowCounter(input: {
    workspaceId: string;
    profileId: string | null;
    feature: UsageFeatureCategory;
    windowKind: UsageWindowKind;
    windowStart: string;
  }): Promise<WindowCounter> {
    const key = `${input.workspaceId}|${input.profileId ?? ""}|${input.feature}|${input.windowKind}|${input.windowStart}`;
    return this.counters.get(key) ?? { requestCount: 0, units: 0, costMicros: 0 };
  }

  async incrementWindowCounter(input: {
    workspaceId: string;
    profileId: string | null;
    feature: UsageFeatureCategory;
    windowKind: UsageWindowKind;
    windowStart: string;
    requestDelta?: number;
    unitsDelta?: number;
    costMicrosDelta?: number;
  }): Promise<WindowCounter> {
    const key = `${input.workspaceId}|${input.profileId ?? ""}|${input.feature}|${input.windowKind}|${input.windowStart}`;
    const current = this.counters.get(key) ?? {
      requestCount: 0,
      units: 0,
      costMicros: 0,
    };
    const next = {
      requestCount: current.requestCount + (input.requestDelta ?? 0),
      units: current.units + (input.unitsDelta ?? 0),
      costMicros: current.costMicros + (input.costMicrosDelta ?? 0),
    };
    this.counters.set(key, next);
    return next;
  }

  async countActiveReservations(input: {
    workspaceId: string;
    feature: UsageFeatureCategory;
  }): Promise<number> {
    return [...this.events.values()].filter(
      (event) =>
        event.workspaceId === input.workspaceId &&
        event.feature === input.feature &&
        event.status === "reserved",
    ).length;
  }

  async sumWorkspaceCost(input: {
    workspaceId: string;
    windowKind: UsageWindowKind;
    windowStart: string;
  }): Promise<number> {
    void input.windowKind;
    return [...this.events.values()]
      .filter(
        (event) =>
          event.workspaceId === input.workspaceId &&
          event.createdAt >= input.windowStart &&
          event.status !== "released",
      )
      .reduce(
        (sum, event) =>
          sum + (event.actualCostMicros ?? event.estimatedCostMicros),
        0,
      );
  }

  async sumUserExpensiveCost(input: {
    profileId: string;
    windowKind: UsageWindowKind;
    windowStart: string;
  }): Promise<number> {
    void input.windowKind;
    return [...this.events.values()]
      .filter(
        (event) =>
          event.profileId === input.profileId &&
          event.createdAt >= input.windowStart &&
          event.status !== "released",
      )
      .reduce(
        (sum, event) =>
          sum + (event.actualCostMicros ?? event.estimatedCostMicros),
        0,
      );
  }

  async sumGlobalCost(input: {
    windowKind: UsageWindowKind;
    windowStart: string;
  }): Promise<number> {
    void input.windowKind;
    return [...this.events.values()]
      .filter(
        (event) =>
          event.createdAt >= input.windowStart && event.status !== "released",
      )
      .reduce(
        (sum, event) =>
          sum + (event.actualCostMicros ?? event.estimatedCostMicros),
        0,
      );
  }

  async writeAudit(entry: Omit<UsageAuditEntry, "id" | "createdAt">): Promise<void> {
    this.audits.push({
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }

  getAudits() {
    return this.audits;
  }
}

let testStore: MemoryUsageStore | null = null;

export function setUsageStoreForTests(store: UsageStore | null) {
  testStore = store instanceof MemoryUsageStore ? store : null;
}

export function getUsageStoreForTests(): MemoryUsageStore | null {
  return testStore;
}
