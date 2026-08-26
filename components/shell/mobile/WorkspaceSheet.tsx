"use client";

import { Check } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useApp } from "@/components/app/AppProvider";
import { SettingsGroup } from "@/components/settings/SettingsChrome";
import { WorkspaceMark } from "@/components/shell/WorkspaceMark";
import { workspacesFor } from "@/lib/entitlements";
import {
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  subscribeWorkspaceCatalog,
} from "@/lib/workspace-catalog";
import { cn } from "@/lib/utils";

export function WorkspaceSheet({
  onSelect,
}: {
  onSelect: () => void;
}) {
  const {
    workspace,
    setWorkspace,
    actor,
    entitlements,
  } = useApp();

  useSyncExternalStore(
    subscribeWorkspaceCatalog,
    getWorkspaceCatalogSnapshot,
    getWorkspaceCatalogServerSnapshot,
  );

  const allowed = workspacesFor(actor, entitlements);

  return (
    <SettingsGroup dividerInset="icon">
      {allowed.map((item) => {
        const active = item.id === workspace.id;
        return (
          <button
            key={item.id}
            type="button"
            data-active={active ? "true" : undefined}
            onClick={() => {
              setWorkspace(item.id);
              onSelect();
            }}
            className={cn(
              "flex w-full items-center gap-3.5 px-4 py-3.5 text-left text-[16px] transition-colors duration-200 hover:bg-muted/50",
              active && "bg-muted/70 font-medium",
            )}
          >
            <WorkspaceMark
              id={item.id}
              name={item.name}
              active={active}
              size="lg"
            />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {active ? (
              <Check
                className="h-4 w-4 shrink-0 text-foreground"
                strokeWidth={2}
              />
            ) : null}
          </button>
        );
      })}
    </SettingsGroup>
  );
}
