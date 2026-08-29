"use client";

import { SectionLabel } from "@/components/panels/Bits";

/**
 * Chats are owner-private (migration 027). This panel no longer implies
 * workspace-visible threads — that claim was false under RLS.
 */
export function SharedPanel() {
  return (
    <div className="p-3 pt-4">
      <SectionLabel>Your chats</SectionLabel>
      <p className="px-3 py-6 text-[13px] leading-relaxed text-muted-foreground">
        Chats stay private to you. Teammates in a shared workspace can see
        projects and files, not your conversations.
      </p>
    </div>
  );
}
