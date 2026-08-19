"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { LayoutToggle, ScopeToggle } from "@/components/spaces/ItemSet";
import {
  PreviewGrid,
  type PreviewEntry,
  type PreviewKind,
} from "@/components/spaces/PreviewCard";
import {
  apiKeys,
  platformApis,
  platformDeployments,
  platformModels,
} from "@/lib/data";
import { hostingModes } from "@/lib/billing";
import type { HostingMode } from "@/lib/types";

export function PlatformPreviewGrid({
  items,
  onOpen,
  empty = "Nothing here yet.",
  kind = "product",
  filters,
}: {
  items: PreviewEntry[];
  onOpen?: (id: string) => void;
  empty?: string;
  kind?: PreviewKind;
  filters?: { id: string; label: string }[];
}) {
  const { spaceLayout, setSpaceLayout } = useApp();
  const [scope, setScope] = useState(filters?.[0]?.id ?? "all");

  const visible = useMemo(() => {
    if (!filters || scope === "all") return items;
    return items.filter((item) => item.projectId.startsWith(`${scope}:`));
  }, [filters, items, scope]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {filters?.length ? (
          <ScopeToggle value={scope} onChange={setScope} options={filters} />
        ) : (
          <span />
        )}
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </div>
      <div className="mt-5">
        <PreviewGrid
          layout={spaceLayout}
          items={visible}
          onOpen={onOpen ?? (() => {})}
          empty={empty}
          kind={kind}
        />
      </div>
    </>
  );
}

export function modelPreviews(): PreviewEntry[] {
  return platformModels.map((model) => ({
    id: model.name,
    name: model.name,
    projectId: `${model.runtime.toLowerCase().replace(/\s+/g, "-")}:${model.name}`,
    meta: `${model.runtime} · ${model.memory}`,
    badge: model.status,
    initial: model.name.charAt(0),
    kind: "product" as const,
  }));
}

export function modelFilters() {
  return [
    { id: "all", label: "All" },
    { id: "cloud", label: "Cloud" },
    { id: "local", label: "Local" },
    { id: "on-device", label: "On-device" },
  ];
}

export function apiPreviews(
  apis: typeof platformApis = platformApis,
): PreviewEntry[] {
  return apis.map((api) => ({
    id: api.id,
    name: api.name,
    projectId: api.id,
    meta: `${api.method} · api.courier.dev`,
    detail: api.path,
    badge: api.method,
    initial: api.name.charAt(0),
    kind: "skill" as const,
  }));
}

export function keyPreviews(keys: typeof apiKeys = apiKeys): PreviewEntry[] {
  return keys.map((key) => ({
    id: `${key.name}-${key.hint}`,
    name: key.name,
    projectId: key.hint,
    meta: `Created ${key.created}`,
    detail: "KEY",
    badge: key.hint.split("_")[0]?.replace("crr", "").toUpperCase() || "KEY",
    initial: key.name.charAt(0),
    kind: "file" as const,
  }));
}

export function deploymentPreviews(): PreviewEntry[] {
  return platformDeployments.map((item) => ({
    id: item.name,
    name: item.name,
    projectId: `${item.status.toLowerCase()}:${item.name}`,
    meta: item.hint,
    badge: item.status,
    initial: item.name.charAt(0),
    kind: "product" as const,
  }));
}

export function deploymentFilters() {
  return [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "standby", label: "Standby" },
    { id: "ready", label: "Ready" },
  ];
}

export function hostingPreviews(active: HostingMode): PreviewEntry[] {
  return hostingModes.map((mode) => {
    const isActive = active === mode.id;
    return {
      id: mode.id,
      name: mode.label,
      projectId: mode.id,
      meta: mode.body,
      badge: isActive ? "Current" : mode.label,
      detail: mode.why,
      initial: mode.label.charAt(0),
      kind: "product" as const,
    };
  });
}
