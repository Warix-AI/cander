"use client";

import { createElement } from "react";
import { ChevronDown, ChevronUp, Lock, SquarePen, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { Modal } from "@/components/ui/Modal";
import { spaces } from "@/lib/data";
import {
  extraNavLabels,
  navIcon,
} from "@/lib/space-icons";
import {
  isExtraNavId,
  resolveSidebarNav,
  type SidebarNavId,
} from "@/lib/spaces";
import { memberSpaces } from "@/lib/workspace-policy";

export function ConfigureModal() {
  const {
    overlay,
    closeOverlay,
    workspace,
    workspacePolicies,
    sidebarLayout,
    moveSidebarNav,
    billingPlan,
    actor,
  } = useApp();
  const allowed = memberSpaces(
    workspace.id,
    actor.id,
    workspacePolicies,
  );
  const { main } = resolveSidebarNav(allowed, sidebarLayout, {
    billingPlan,
  });

  return (
    <Modal
      open={overlay === "configure"}
      onClose={closeOverlay}
      labelledBy="configure-title"
      className="flex w-[min(28rem,calc(100vw-2rem))] flex-col"
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <h2
            id="configure-title"
            className="text-[16px] font-semibold tracking-[-0.03em]"
          >
            Configure
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Reorder the sidebar. New stays put.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={closeOverlay}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto px-3 pb-4">
        <LockedRow />
        {main.map((id, index) => (
          <NavRow
            key={id}
            id={id}
            upDisabled={index === 0}
            downDisabled={index === main.length - 1}
            onMove={moveSidebarNav}
          />
        ))}
      </div>
    </Modal>
  );
}

function LockedRow() {
  return (
    <div className="flex items-center gap-1 rounded-[10px] px-1 py-1">
      <SquarePen
        className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground"
        strokeWidth={1.6}
      />
      <span className="min-w-0 flex-1 truncate px-1.5 text-[13.5px]">
        New
      </span>
      <span
        className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground"
        title="Always in the sidebar"
      >
        <Lock className="h-3.5 w-3.5" strokeWidth={1.6} />
      </span>
    </div>
  );
}

function NavRow({
  id,
  upDisabled,
  downDisabled,
  onMove,
}: {
  id: SidebarNavId;
  upDisabled: boolean;
  downDisabled: boolean;
  onMove: (id: SidebarNavId, dir: -1 | 1) => void;
}) {
  const Icon = navIcon(id);
  const label = isExtraNavId(id)
    ? extraNavLabels[id]
    : spaces.find((item) => item.id === id)?.label;
  if (!label) return null;

  return (
    <div className="flex items-center gap-1 rounded-[10px] px-1 py-1">
      {createElement(Icon, {
        className: "ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground",
        strokeWidth: 1.6,
      })}
      <span className="min-w-0 flex-1 truncate px-1.5 text-[13.5px]">
        {label}
      </span>
      <button
        type="button"
        aria-label="Move up"
        disabled={upDisabled}
        onClick={() => onMove(id, -1)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.6} />
      </button>
      <button
        type="button"
        aria-label="Move down"
        disabled={downDisabled}
        onClick={() => onMove(id, 1)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.6} />
      </button>
    </div>
  );
}
