"use client";

import { Check } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useApp } from "@/components/app/AppProvider";
import { WorkspaceMark } from "@/components/shell/WorkspaceMark";
import {
  MOBILE_MENU_ICON_SIZE,
  mobileMenuRowActiveClass,
  mobileMenuRowClass,
} from "@/lib/mobile-menu-styles";
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
    <div className="space-y-px">
      {allowed.map((item) => {
        const active = item.id === workspace.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setWorkspace(item.id);
              onSelect();
            }}
            className={cn(
              mobileMenuRowClass,
              active && mobileMenuRowActiveClass,
            )}
          >
            <WorkspaceMark
              id={item.id}
              name={item.name}
              active={active}
              size="sm"
            />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {active ? (
              <Check
                className={cn(MOBILE_MENU_ICON_SIZE, "shrink-0")}
                strokeWidth={2}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
