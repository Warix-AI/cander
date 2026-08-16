"use client";

import { Building2, LogOut, Settings } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { Dropdown } from "@/components/ui/Controls";
import { currentUser } from "@/lib/data";
import { cn } from "@/lib/utils";

export function AccountMenu() {
  const { workspace, overlay, openOverlay, openSettings } = useApp();

  return (
    <Dropdown
      placement="top"
      className="w-full"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-200 hover:bg-muted",
            open && "bg-muted",
          )}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-[11px] font-semibold">
            {currentUser.initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-medium">
              {currentUser.name}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {workspace.name} · Acme Inc.
            </span>
          </span>
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon={Building2}
            label="Workspace"
            active={overlay === "workspace"}
            onClick={() => {
              close();
              openOverlay("workspace");
            }}
          />
          <MenuItem
            icon={Settings}
            label="Settings"
            active={overlay === "settings"}
            onClick={() => {
              close();
              openSettings();
            }}
          />
          <MenuItem icon={LogOut} label="Log out" onClick={close} />
        </>
      )}
    </Dropdown>
  );
}

function MenuItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Settings;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13.5px] transition-colors duration-200 hover:bg-muted",
        active && "bg-muted",
      )}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
      <span>{label}</span>
    </button>
  );
}
