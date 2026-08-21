"use client";

import { Blocks, Settings } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { AccountAvatar } from "@/components/shell/AccountAvatar";
import { Dropdown } from "@/components/ui/Controls";
import { account } from "@/lib/data";
import { planLabel } from "@/lib/billing";
import { cn } from "@/lib/utils";

export function AccountMenu() {
  const {
    product,
    overlay,
    openSettings,
    openSpace,
    spaceId,
    actor,
    entitlements,
  } = useApp();

  const subtitle = entitlements.orgActive
    ? `${account.name} · ${entitlements.role}`
    : entitlements.showInviteWall
      ? `${planLabel(entitlements.plan)} · invite pending`
      : planLabel(entitlements.plan);

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
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-200 hover:bg-sidebar-accent",
            open && "bg-sidebar-accent",
          )}
        >
          <AccountAvatar
            memberId={actor.id}
            name={actor.name}
            initials={actor.initials}
          />
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-medium">
              {actor.name}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {subtitle}
            </span>
          </span>
        </button>
      )}
    >
      {(close) => (
        <>
          {product === "courier" ? (
            <MenuItem
              icon={Blocks}
              label="Connectors"
              active={spaceId === "connectors"}
              onClick={() => {
                close();
                openSpace("connectors");
              }}
            />
          ) : null}
          <MenuItem
            icon={Settings}
            label="Settings"
            active={overlay === "settings"}
            onClick={() => {
              close();
              openSettings();
            }}
          />
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
