"use client";

import { useApp } from "@/components/app/AppProvider";
import { Modal } from "@/components/ui/Modal";
import { account } from "@/lib/data";

export function InviteWall() {
  const { overlay, closeOverlay, openSettings, entitlements } = useApp();

  return (
    <Modal
      open={overlay === "invite-wall"}
      onClose={closeOverlay}
      labelledBy="invite-wall-title"
      className="w-full max-w-[28rem]"
    >
      <div className="px-5 pt-5 pb-6">
        <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
          {account.name}
        </p>
        <h2
          id="invite-wall-title"
          className="mt-2 text-[18px] font-medium tracking-[-0.02em]"
        >
          A Pro seat is required
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          {account.name} is a Pro organization. Shared workspaces, Work, and
          org admin stay locked until an Owner or Admin adds a Pro seat for
          you.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled
            className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-[13.5px] font-medium tracking-[-0.01em] text-primary-foreground opacity-50"
          >
            Ask an admin
          </button>
          <button
            type="button"
            onClick={() => {
              closeOverlay();
              openSettings("plans");
            }}
            className="inline-flex h-10 items-center rounded-full border border-foreground/15 px-4 text-[13.5px] font-medium tracking-[-0.01em] hover:bg-muted"
          >
            View plans
          </button>
        </div>
        {entitlements.plan === "plus" ? (
          <p className="mt-4 text-[12.5px] text-muted-foreground">
            Your Plus account still works for personal workspaces
            {entitlements.ultraAssigned ? " and full Platform via Ultra" : ""}.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

export function InviteBanner() {
  const { entitlements, openOverlay, openSettings } = useApp();
  if (!entitlements.showInviteWall) return null;

  return (
    <div className="border-b border-border bg-card px-4 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
      Acme invited you. A Pro seat is required to use shared workspaces.{" "}
      <button
        type="button"
        onClick={() => openOverlay("invite-wall")}
        className="text-foreground underline-offset-2 hover:underline"
      >
        See why
      </button>
      {" · "}
      <button
        type="button"
        onClick={() => openSettings("plans")}
        className="text-foreground underline-offset-2 hover:underline"
      >
        Plans
      </button>
    </div>
  );
}
