"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, Ellipsis, LayoutGrid, List, SquarePen } from "lucide-react";
import {
  MobileBottomSheet,
  SheetAction,
} from "@/components/browser/ProjectMobileSheets";
import { mobileChromeButtonClass } from "@/lib/mobile-menu-styles";
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
  const value = useMemo(() => ({ actions, setActions }), [actions]);
  return (
    <MobilePanelActionsContext.Provider value={value}>
      {children}
    </MobilePanelActionsContext.Provider>
  );
}

export function useMobilePanelActionsState() {
  return useContext(MobilePanelActionsContext);
}

export function MobileFilterBar({
  active = true,
  children,
  className,
  onNewChat,
  newChatLabel,
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
  const setPanelActions = useMobilePanelActionsState()?.setActions;
  const onNewChatRef = useRef(onNewChat);
  onNewChatRef.current = onNewChat;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const extrasRef = useRef(extras);
  extrasRef.current = extras;

  const scopeValue = scope?.value;
  const layoutValue = layout?.value;
  const scopeOptionsKey = scope?.options.map((o) => o.id).join(",");
  const extrasKey = extras?.map((e) => `${e.id}:${e.active ? 1 : 0}`).join(",");

  useEffect(() => {
    if (!setPanelActions) return;
    if (!active) {
      setPanelActions(null);
      return;
    }
    setPanelActions({
      onNewChat: () => onNewChatRef.current?.(),
      newChatLabel,
      scope: scopeRef.current
        ? {
            ...scopeRef.current,
            onChange: (value: string) => scopeRef.current?.onChange(value),
          }
        : undefined,
      layout: layoutRef.current
        ? {
            ...layoutRef.current,
            onChange: (value: SpaceLayout) =>
              layoutRef.current?.onChange(value),
          }
        : undefined,
      extras: extrasRef.current?.map((item) => ({
        ...item,
        onClick: () => {
          const match = extrasRef.current?.find((row) => row.id === item.id);
          match?.onClick();
        },
      })),
    });
  }, [
    active,
    setPanelActions,
    newChatLabel,
    scopeValue,
    layoutValue,
    scopeOptionsKey,
    extrasKey,
  ]);

  useEffect(() => {
    return () => setPanelActions?.(null);
  }, [setPanelActions]);

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

/**
 * Single ⋯ control on space panels — New build/explore + filters/layout live
 * in one bottom sheet (replaces the old pen + ellipsis cluster).
 */
export function MobilePanelActionsCluster({
  config,
  onCompose,
}: {
  config: MobilePanelActionsConfig;
  onCompose: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const scope = config.scope;
  const layout = config.layout;
  const extras = config.extras ?? [];
  const composeLabel = config.newChatLabel ?? "New";

  return (
    <>
      <button
        type="button"
        aria-label="Space actions"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
        className={cn(mobileChromeButtonClass, menuOpen && "bg-muted")}
      >
        <Ellipsis className="h-5 w-5" strokeWidth={1.8} />
      </button>

      <MobileBottomSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        mode="space"
      >
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-1">
          <div className="mb-3 space-y-0.5">
            <SheetAction
              icon={SquarePen}
              label={composeLabel}
              onClick={() => {
                setMenuOpen(false);
                onCompose();
              }}
            />
          </div>
          {scope ? (
            <div className="mb-3">
              <p className="px-1 pb-1.5 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                Filter
              </p>
              <div className="space-y-0.5">
                {scope.options.map((item) => (
                  <SheetRow
                    key={item.id}
                    label={item.label}
                    selected={scope.value === item.id}
                    onClick={() => scope.onChange(item.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {layout ? (
            <div className="mb-3">
              <p className="px-1 pb-1.5 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                Layout
              </p>
              <div className="space-y-0.5">
                <SheetAction
                  icon={LayoutGrid}
                  label="Cards"
                  active={layout.value === "cards"}
                  onClick={() => layout.onChange("cards")}
                />
                <SheetAction
                  icon={List}
                  label="List"
                  active={layout.value === "list"}
                  onClick={() => layout.onChange("list")}
                />
              </div>
            </div>
          ) : null}
          {extras.length ? (
            <div className="space-y-0.5">
              {extras.map((item) => (
                <SheetRow
                  key={item.id}
                  label={item.label}
                  selected={item.active}
                  onClick={() => {
                    item.onClick();
                    setMenuOpen(false);
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </MobileBottomSheet>
    </>
  );
}

function SheetRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[12px] px-3 py-3 text-left text-[15px] tracking-[-0.01em] transition-colors",
        selected ? "bg-muted font-medium" : "hover:bg-muted/70",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected ? (
        <Check className="h-4 w-4 shrink-0" strokeWidth={2} />
      ) : null}
    </button>
  );
}
