"use client";

import { Settings } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { signOutAccount } from "@/lib/auth/sign-out";
import { cn } from "@/lib/utils";

/** Shared footer row chrome for AccountMenu. */
export const SIDEBAR_FOOTER_ROW =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-200 hover:bg-sidebar-accent";

export { signOutAccount };

export function AccountMenu() {
  const { view, openSettings } = useApp();

  return (
    <button
      type="button"
      onClick={() => openSettings()}
      className={cn(
        SIDEBAR_FOOTER_ROW,
        "text-[13.5px]",
        view === "settings" && "bg-sidebar-accent font-medium",
      )}
      aria-label="Settings"
    >
      <Settings
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        strokeWidth={2}
      />
      Settings
    </button>
  );
}
