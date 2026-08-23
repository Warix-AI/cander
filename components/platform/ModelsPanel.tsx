"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  DataList,
  DataRow,
  EmptyHint,
  GhostBtn,
  ItemCard,
  PanelToolbar,
  Section,
  StatusPill,
} from "@/components/platform/DevChrome";
import { ScopeToggle } from "@/components/spaces/ItemSet";
import { demoLocalHardware, modelFitsHardware, parseMemoryGb } from "@/lib/compute";
import { platformModels, workspaceResources } from "@/lib/data";
import { memberName } from "@/lib/entitlements";

const SCOPE_OPTIONS = [
  { id: "all", label: "All" },
  { id: "cloud", label: "Cloud" },
  { id: "local", label: "Local" },
  { id: "on-device", label: "On-device" },
] as const;

function runtimeToScope(runtime: string) {
  const key = runtime.toLowerCase().replace(/\s+/g, "-");
  if (key === "on-device" || key === "local" || key === "cloud") return key;
  return "cloud";
}

export function ModelsPanel() {
  const {
    hostingMode,
    setPlatformNav,
    workspaceId,
    orgMembers,
    entitlements,
    actor,
  } = useApp();
  const [scope, setScope] = useState<string>("all");

  const managed = workspaceResources.filter(
    (item) => item.workspaceId === workspaceId && item.status === "active",
  );

  const models = useMemo(() => {
    return platformModels
      .map((model) => {
        const scopeId = runtimeToScope(model.runtime);
        const memoryGb = parseMemoryGb(model.memory);
        const hardwareHint =
          (hostingMode === "local" || hostingMode === "on-device") &&
          memoryGb != null &&
          !modelFitsHardware({ memoryGb }, demoLocalHardware)
            ? `Needs ${model.memory}`
            : null;
        const matchesHosting =
          (hostingMode === "cloud" && scopeId === "cloud") ||
          (hostingMode === "local" && scopeId === "local") ||
          (hostingMode === "on-device" && scopeId === "on-device");
        return {
          ...model,
          scopeId,
          hardwareHint,
          inUse: matchesHosting && model.status !== "Warm",
        };
      })
      .filter((model) => (scope === "all" ? true : model.scopeId === scope));
  }, [hostingMode, scope]);

  return (
    <div>
      <PanelToolbar
        trailing={
          <GhostBtn onClick={() => setPlatformNav("hosting")}>
            View hosting
          </GhostBtn>
        }
      >
        <ScopeToggle
          value={scope}
          onChange={setScope}
          options={[...SCOPE_OPTIONS]}
        />
      </PanelToolbar>

      <div className="mt-6 space-y-6">
        {managed.length ? (
          <Section
            title="Workspace-managed"
            description="Shared runtimes owned by this workspace."
          >
            <DataList>
              {managed.map((item) => {
                const owner = memberName(item.ownerId, orgMembers);
                const authorized =
                  item.authorizedMemberIds.includes(actor.id) ||
                  entitlements.canManageWorkspaces;
                return (
                  <DataRow
                    key={item.id}
                    label={item.name}
                    meta={`Managed by ${owner}${authorized ? " · authorized for you" : ""}${item.hosting ? ` · ${item.hosting}` : ""}`}
                  />
                );
              })}
            </DataList>
          </Section>
        ) : null}

        <Section
          title="Models"
          description={`Catalog for this workspace · active hosting is ${hostingMode}.`}
        >
          {models.length ? (
            <div className="grid grid-cols-1 gap-3 @min-[480px]:grid-cols-2 @min-[800px]:grid-cols-3">
              {models.map((model) => (
                <ItemCard
                  key={model.name}
                  title={model.name}
                  meta={`${model.runtime} · ${model.memory}`}
                  selected={model.inUse}
                  badge={
                    <StatusPill
                      tone={
                        model.inUse
                          ? "active"
                          : model.status === "Live" || model.status === "Ready"
                            ? "muted"
                            : "outline"
                      }
                    >
                      {model.inUse ? "In use" : model.status}
                    </StatusPill>
                  }
                  body={
                    <p className="text-[12.5px] text-muted-foreground">
                      {model.hardwareHint
                        ? `${model.hardwareHint} on current hardware`
                        : model.runtime === "Cloud"
                          ? "Hosted by Recursion · metered"
                          : model.runtime === "Local"
                            ? "Runs on LAN machines"
                            : "Runs on this device"}
                    </p>
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyHint>No models in this filter.</EmptyHint>
          )}
        </Section>
      </div>
    </div>
  );
}
