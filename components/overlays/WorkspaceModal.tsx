"use client";

import { Check, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { Modal } from "@/components/ui/Modal";
import { currentUserId, members, workspaces } from "@/lib/data";
import { cn } from "@/lib/utils";

export function WorkspaceModal() {
  const { overlay, closeOverlay, workspace, setWorkspace } = useApp();
  const me = members.find((member) => member.id === currentUserId);
  const assigned = workspaces.filter((item) =>
    me?.workspaceIds.includes(item.id),
  );

  return (
    <Modal
      open={overlay === "workspace"}
      onClose={closeOverlay}
      labelledBy="workspace-switcher-title"
      className="w-full max-w-[28rem]"
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <h2
            id="workspace-switcher-title"
            className="text-[16px] font-semibold tracking-[-0.03em]"
          >
            Workspaces
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Switch to a workspace you are assigned to.
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

      <div className="px-3 pb-4">
        {assigned.map((item) => {
          const active = item.id === workspace.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setWorkspace(item.id);
                closeOverlay();
              }}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors duration-200 hover:bg-muted",
                active && "bg-muted",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium tracking-[-0.02em]">
                  {item.name}
                </span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  {item.members} members · {item.spend} of {item.budget}
                </span>
              </span>
              {active ? (
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0"
                  strokeWidth={1.75}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
