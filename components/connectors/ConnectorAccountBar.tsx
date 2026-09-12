"use client";

import { Plus } from "lucide-react";
import {
  MAX_CONNECTOR_ACCOUNTS_PER_CONNECTOR,
  connectorAccountLimitMessage,
} from "@/lib/connectors/account-names";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { cn } from "@/lib/utils";

/**
 * Floating account switcher for the connector management/detail screen only.
 * Same glass-pill language as other Candor floating navs; sits above the
 * connector header (not in the sidebar or right-panel app).
 */
export function ConnectorAccountBar({
  accounts,
  activeId,
  onSelect,
  onAdd,
  addDisabled,
  className,
}: {
  accounts: ConnectorConnection[];
  activeId: string | null;
  onSelect: (connectionId: string) => void;
  onAdd: () => void;
  addDisabled?: boolean;
  className?: string;
}) {
  const atLimit = accounts.length >= MAX_CONNECTOR_ACCOUNTS_PER_CONNECTOR;
  const disableAdd = Boolean(addDisabled) || atLimit;

  return (
    <div className={cn("w-full", className)}>
      <nav
        aria-label="Connected accounts"
        className={cn(
          "mobile-floating-nav mobile-glass-pill flex h-14 w-full max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain rounded-[28px] border border-border/60 px-2",
          "bg-background/90 shadow-[0_8px_28px_oklch(0_0_0/0.08)] backdrop-blur-xl",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {accounts.map((account) => {
          const active = account.id === activeId;
          return (
            <button
              key={account.id}
              type="button"
              aria-current={active ? "page" : undefined}
              title={account.displayName}
              onClick={() => onSelect(account.id)}
              className={cn(
                "h-10 max-w-[7.5rem] shrink-0 truncate rounded-full px-4 text-[14px] font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              {account.displayName}
            </button>
          );
        })}
        <button
          type="button"
          aria-label={
            atLimit
              ? connectorAccountLimitMessage()
              : "Add another account"
          }
          title={
            atLimit
              ? connectorAccountLimitMessage()
              : "Add account"
          }
          disabled={disableAdd}
          onClick={onAdd}
          className={cn(
            "ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
            disableAdd
              ? "cursor-not-allowed text-muted-foreground/40"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          <Plus className="h-5 w-5" strokeWidth={1.8} />
        </button>
      </nav>
      {atLimit ? (
        <p className="mt-2 px-1 text-[11px] text-muted-foreground">
          {connectorAccountLimitMessage()}
        </p>
      ) : null}
    </div>
  );
}
