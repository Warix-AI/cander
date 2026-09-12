"use client";

import { Plus } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import {
  MAX_CONNECTOR_ACCOUNTS_PER_CONNECTOR,
  connectorAccountLimitMessage,
} from "@/lib/connectors/account-names";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { CONNECTOR_CONTROL_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

const glassShell = cn(
  "bg-white/45 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-white/[0.06] dark:shadow-[0_8px_24px_rgba(0,0,0,0.16)]",
  CONNECTOR_CONTROL_RADIUS,
);

/**
 * Account selector — only shown once at least one account exists.
 * Empty/connect CTA lives in the detail header actions (filter slot).
 */
export function ConnectorAccountBar({
  connectorIcon,
  accounts,
  activeId,
  onSelect,
  onAdd,
  addDisabled,
  className,
}: {
  connectorIcon: string;
  accounts: ConnectorConnection[];
  activeId: string | null;
  onSelect: (connectionId: string) => void;
  onAdd: () => void;
  addDisabled?: boolean;
  className?: string;
}) {
  const atLimit = accounts.length >= MAX_CONNECTOR_ACCOUNTS_PER_CONNECTOR;
  const disableAdd = Boolean(addDisabled) || atLimit;

  if (!accounts.length) return null;

  return (
    <div className={cn("w-full", className)}>
      <nav
        aria-label="Connected accounts"
        className="flex max-w-full flex-wrap items-center gap-2"
      >
        <div
          className={cn(
            "inline-flex max-w-full items-center gap-0.5 overflow-x-auto p-1",
            glassShell,
          )}
        >
          {accounts.map((account) => {
            const active = account.id === activeId;
            const label =
              String(account.displayName ?? "").trim() || "Account";
            return (
              <button
                key={account.id}
                type="button"
                aria-pressed={active}
                title={label}
                onClick={() => onSelect(account.id)}
                className={cn(
                  "inline-flex h-8 max-w-[9.5rem] shrink-0 items-center gap-1.5 px-3 text-[13px] font-medium tracking-[-0.01em] transition-colors duration-200",
                  CONNECTOR_CONTROL_RADIUS,
                  active
                    ? "bg-black/[0.06] text-foreground dark:bg-white/[0.1]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ConnectorMark
                  id={connectorIcon}
                  size="nav"
                  className="shrink-0 opacity-80"
                />
                <span className="min-w-0 truncate">{label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-label={
            atLimit ? connectorAccountLimitMessage() : "Add another account"
          }
          title={atLimit ? connectorAccountLimitMessage() : "Add account"}
          disabled={disableAdd}
          onClick={onAdd}
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center transition-colors duration-200",
            CONNECTOR_CONTROL_RADIUS,
            disableAdd
              ? "cursor-not-allowed text-muted-foreground/40"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </nav>
      {atLimit ? (
        <p className="mt-2 px-0.5 text-[11px] text-muted-foreground">
          {connectorAccountLimitMessage()}
        </p>
      ) : null}
    </div>
  );
}

export const connectorAccountChipShell = glassShell;
