"use client";

import { LogOut, Settings } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { AccountAvatar } from "@/components/shell/AccountAvatar";
import { signOutAccount } from "@/components/shell/AccountMenu";
import { planLabel } from "@/lib/billing";
import { cn } from "@/lib/utils";

const rowClass =
  "menu-row-hover flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] transition-colors duration-200";

export function AccountSheet({ onSelect }: { onSelect: () => void }) {
  const { openSettings, actor, entitlements } = useApp();

  const subtitle = entitlements.orgActive
    ? entitlements.role
    : entitlements.showInviteWall
      ? `${planLabel(entitlements.plan)} · invite pending`
      : planLabel(entitlements.plan);

  return (
    <div className="p-2">
      <div className="mb-1 flex items-center gap-3 px-3 py-2">
        <AccountAvatar
          memberId={actor.id}
          name={actor.name}
          initials={actor.initials}
        />
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-medium tracking-[-0.01em]">
            {actor.name}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {subtitle}
          </span>
        </span>
      </div>
      <button
        type="button"
        className={rowClass}
        onClick={() => {
          openSettings(undefined, { hub: true });
          onSelect();
        }}
      >
        <Settings className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.7} />
        Settings
      </button>
      <button
        type="button"
        className={cn(rowClass, "text-foreground")}
        onClick={() => {
          void signOutAccount();
          onSelect();
        }}
      >
        <LogOut className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.7} />
        Log out
      </button>
    </div>
  );
}
