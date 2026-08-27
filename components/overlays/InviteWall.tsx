"use client";

import { useApp } from "@/components/app/AppProvider";
import { Modal } from "@/components/ui/Modal";
import { planLabel } from "@/lib/billing";

export function InviteWall() {
  const { overlay, closeOverlay, openSettings, entitlements, actor } = useApp();
  const isPro = entitlements.plan === "pro";
  const orgName = actor.managedByOrgName || "Your organization";

  return (
    <Modal
      open={overlay === "invite-wall"}
      onClose={closeOverlay}
      labelledBy="invite-wall-title"
      className="w-full max-w-[28rem]"
    >
      <div className="px-5 pt-5 pb-6">
        <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
          {orgName}
        </p>
        <h2
          id="invite-wall-title"
          className="mt-2 text-[18px] font-medium tracking-[-0.02em]"
        >
          {isPro ? "Accept your Pro seat" : "Accept your Max seat"}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          {orgName} invited you with a {planLabel(entitlements.plan)} seat.
          {isPro
            ? " Personal workspaces and limited org access unlock once an Owner or Admin activates your seat."
            : " Shared workspaces, org collaboration, and admin features unlock once an Owner or Admin activates your seat."}
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
        <p className="mt-4 text-[12.5px] text-muted-foreground">
          Organizations can mix Pro and Max seats — Pro for personal workspaces,
          Max for shared workspace features.
        </p>
      </div>
    </Modal>
  );
}

export function InviteBanner() {
  // Invite strip temporarily retired from the shell chrome.
  return null;
}
