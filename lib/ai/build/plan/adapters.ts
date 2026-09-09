/**
 * Kind adapters for plan-first create (Phase 6).
 * Sites are live; apps keep reserved fields without changing app UX yet.
 */

import type { ProjectKind, ProjectSpec } from "@/lib/ai/build/plan/types";

export type PlanFirstKindAdapter = {
  kind: ProjectKind;
  /** Whether this kind may enter the plan-first create spine today. */
  createEnabled: boolean;
  reservedFields: Array<keyof ProjectSpec>;
};

export const SITE_PLAN_ADAPTER: PlanFirstKindAdapter = {
  kind: "site",
  createEnabled: true,
  reservedFields: [],
};

export const APP_PLAN_ADAPTER: PlanFirstKindAdapter = {
  kind: "app",
  createEnabled: false,
  reservedFields: [
    "auth",
    "dataModel",
    "apis",
    "screens",
    "workflows",
    "permissions",
  ],
};

export function adapterForKind(kind: ProjectKind): PlanFirstKindAdapter {
  return kind === "app" ? APP_PLAN_ADAPTER : SITE_PLAN_ADAPTER;
}

export function stripAppReservedFields(spec: ProjectSpec): ProjectSpec {
  if (spec.kind !== "site") return spec;
  const {
    auth: _a,
    dataModel: _d,
    apis: _apis,
    screens: _s,
    workflows: _w,
    permissions: _p,
    ...rest
  } = spec;
  return rest;
}
