"use client";

import { useApp } from "@/components/app/AppProvider";
import { AccountAvatar } from "@/components/shell/AccountAvatar";
import { account } from "@/lib/data";
import { planLabel } from "@/lib/billing";
import { cn } from "@/lib/utils";

/** Shared footer row chrome for AccountMenu. */
export const SIDEBAR_FOOTER_ROW =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-200 hover:bg-sidebar-accent";

export function AccountMenu() {
  const { view, openSettings, actor, entitlements } = useApp();

  const subtitle = entitlements.orgActive
    ? `${account.name} · ${entitlements.role}`
    : entitlements.showInviteWall
      ? `${planLabel(entitlements.plan)} · invite pending`
      : planLabel(entitlements.plan);

  return (
    <button
      type="button"
      onClick={() => openSettings()}
      className={cn(
        SIDEBAR_FOOTER_ROW,
        view === "settings" && "bg-sidebar-accent",
      )}
      aria-label={`Settings. ${actor.name}. ${subtitle}`}
    >
      <AccountAvatar
        memberId={actor.id}
        name={actor.name}
        initials={actor.initials}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] leading-tight font-medium">
          {actor.name}
        </span>
        <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
  );
}
