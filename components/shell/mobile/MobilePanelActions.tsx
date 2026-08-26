"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Check, Ellipsis, LayoutGrid, List, SquarePen } from "lucide-react";
import { Dropdown } from "@/components/ui/Controls";
import type { SpaceLayout } from "@/lib/types";
import { cn } from "@/lib/utils";

export type MobilePanelScopeConfig = {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
};

export type MobilePanelExtraItem = {
  id: string;
  label: string;
  onClick: () => void;
  active?: boolean;
};

export type MobilePanelActionsConfig = {
  onNewChat?: () => void;
  newChatLabel?: string;
  scope?: MobilePanelScopeConfig;
  layout?: { value: SpaceLayout; onChange: (value: SpaceLayout) => void };
  extras?: MobilePanelExtraItem[];
};

type MobilePanelActionsContextValue = {
  actions: MobilePanelActionsConfig | null;
  setActions: (actions: MobilePanelActionsConfig | null) => void;
};

const MobilePanelActionsContext =
  createContext<MobilePanelActionsContextValue | null>(null);

export function MobilePanelActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<MobilePanelActionsConfig | null>(null);
  return (
    <MobilePanelActionsContext.Provider value={{ actions, setActions }}>
      {children}
    </MobilePanelActionsContext.Provider>
  );
}

export function useMobilePanelActionsState() {
  return useContext(MobilePanelActionsContext);
}

/**
 * On mobile, hoists scope/layout/new-chat into MobileAppChrome.
 * On desktop/web, renders the filter row unchanged.
 */
export function MobileFilterBar({
  active = true,
  children,
  className,
  onNewChat,
  newChatLabel = "New chat",
  scope,
  layout,
  extras,
}: {
  active?: boolean;
  children: ReactNode;
  className?: string;
  onNewChat?: () => void;
  newChatLabel?: string;
  scope?: MobilePanelScopeConfig;
  layout?: { value: SpaceLayout; onChange: (value: SpaceLayout) => void };
  extras?: MobilePanelExtraItem[];
}) {
  const ctx = useMobilePanelActionsState();

  const scopeValue = scope?.value;
  const layoutValue = layout?.value;
  const scopeOptionsKey = scope?.options.map((o) => o.id).join(",");
  const extrasKey = extras?.map((e) => `${e.id}:${e.active ? 1 : 0}`).join(",");

  useEffect(() => {
    if (!ctx) return;
    if (!active) {
      ctx.setActions(null);
      return;
    }
    ctx.setActions({
      onNewChat: () => onNewChat?.(),
      newChatLabel,
      scope,
      layout,
      extras,
    });
    return () => ctx.setActions(null);
  }, [
    active,
    ctx,
    newChatLabel,
    onNewChat,
    scope,
    layout,
    extras,
    scopeValue,
    layoutValue,
    scopeOptionsKey,
    extrasKey,
  ]);

  return (
    <div
      className={cn(
        "hidden flex-row flex-wrap items-center justify-between gap-2 @min-[420px]:gap-3 lg:flex",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MobilePanelActionsCluster({
  config,
  onNewChat,
}: {
  config: MobilePanelActionsConfig;
  onNewChat: () => void;
}) {
  const scope = config.scope;
  const layout = config.layout;
  const extras = config.extras ?? [];
  const hasMenu = Boolean(scope || layout || extras.length);

  return (
    <div className="inline-flex max-w-full shrink-0 items-center rounded-full bg-muted/70 p-1">
      <button
        type="button"
        aria-label={config.newChatLabel ?? "New chat"}
        onClick={onNewChat}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors duration-200 hover:bg-black/[0.06] dark:hover:bg-white/10",
        )}
      >
        <SquarePen className="h-4 w-4 shrink-0" strokeWidth={1.8} />
      </button>
      {hasMenu ? (
        <Dropdown
          align="end"
          matchTrigger={false}
          menuClassName="min-w-[12rem] max-h-[70vh] overflow-y-auto rounded-[14px] border border-border bg-popover shadow-lg dark:bg-card"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              aria-label="View options"
              aria-expanded={open}
              onClick={toggle}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted",
                open && "bg-muted",
              )}
            >
              <Ellipsis className="h-4 w-4" strokeWidth={1.8} />
            </button>
          )}
        >
          {(close) => (
            <>
              {scope ? (
                <>
                  <p className="px-3 py-1 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                    Filter
                  </p>
                  {scope.options.map((item) => {
                    const selected = scope.value === item.id;
                    return (
                      <PanelMenuItem
                        key={item.id}
                        label={item.label}
                        selected={selected}
                        onClick={() => {
                          scope.onChange(item.id);
                          close();
                        }}
                      />
                    );
                  })}
                </>
              ) : null}
              {layout ? (
                <>
                  {scope ? (
                    <div className="my-1.5 mx-2 h-px bg-border" />
                  ) : null}
                  <p className="px-3 py-1 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                    Layout
                  </p>
                  <PanelMenuItem
                    label="Cards"
                    icon={LayoutGrid}
                    selected={layout.value === "cards"}
                    onClick={() => {
                      layout.onChange("cards");
                      close();
                    }}
                  />
                  <PanelMenuItem
                    label="List"
                    icon={List}
                    selected={layout.value === "list"}
                    onClick={() => {
                      layout.onChange("list");
                      close();
                    }}
                  />
                </>
              ) : null}
              {extras.length ? (
                <>
                  {scope || layout ? (
                    <div className="my-1.5 mx-2 h-px bg-border" />
                  ) : null}
                  {extras.map((item) => (
                    <PanelMenuItem
                      key={item.id}
                      label={item.label}
                      selected={item.active}
                      onClick={() => {
                        item.onClick();
                        close();
                      }}
                    />
                  ))}
                </>
              ) : null}
            </>
          )}
        </Dropdown>
      ) : null}
    </div>
  );
}

function PanelMenuItem({
  label,
  selected,
  onClick,
  icon: Icon,
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
  icon?: typeof LayoutGrid;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "menu-row-hover flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors",
        selected && "font-medium",
      )}
    >
      {Icon ? (
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected ? (
        <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      ) : null}
    </button>
  );
}
