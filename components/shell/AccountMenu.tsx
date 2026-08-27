"use client";

import { LogOut, Settings } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { AccountAvatar } from "@/components/shell/AccountAvatar";
import { Dropdown } from "@/components/ui/Controls";
import { planLabel } from "@/lib/billing";
import { signOutAccount } from "@/lib/auth/sign-out";
import { cn } from "@/lib/utils";

/** Shared footer row chrome for AccountMenu. */
export const SIDEBAR_FOOTER_ROW =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-200 hover:bg-sidebar-accent";

export { signOutAccount };

const menuItemClass =
  "menu-row-hover flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-[13.5px] transition-colors duration-200";

export function AccountMenu() {
  const { view, openSettings, actor, entitlements } = useApp();

  const subtitle = entitlements.orgActive
    ? `${entitlements.role}`
    : entitlements.showInviteWall
      ? `${planLabel(entitlements.plan)} · invite pending`
      : planLabel(entitlements.plan);

  return (
    <Dropdown
      placement="top"
      align="start"
      matchTrigger
      menuClassName="min-w-[12rem]"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          className={cn(
            SIDEBAR_FOOTER_ROW,
            (open || view === "settings") && "bg-sidebar-accent",
          )}
          aria-label={`Account menu. ${actor.name}. ${subtitle}`}
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
      )}
    >
      {(close) => (
        <>
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              openSettings();
              close();
            }}
          >
            <Settings className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.7} />
            Settings
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              void signOutAccount().finally(() => close());
            }}
          >
            <LogOut className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.7} />
            Log out
          </button>
        </>
      )}
    </Dropdown>
  );
}
