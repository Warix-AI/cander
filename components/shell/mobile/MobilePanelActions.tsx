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
  MobileHeaderActionsPopover,
  SheetAction,
} from "@/components/browser/ProjectMobileSheets";
import { getNativeCapabilities } from "@/lib/native";
import { mobileChromeButtonClass } from "@/lib/mobile-menu-styles";
import type { SpaceLayout } from "@/lib/types";
import { cn } from "@/lib/utils";

export type MobilePanelScopeConfig = {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
  /** Section heading — defaults to "Filter". */
  label?: string;
};

export type MobilePanelExtraItem = {
  id: string;
  label: string;
  onClick: () => void;
  active?: boolean;
};

export type MobilePanelActionsConfig = {
  connector?: {
    title: string;
    back?: { label: string; onClick: () => void };
    syncHint?: string | null;
    controls?: ReactNode;
    actions: { label: string; icon: typeof SquarePen; disabled?: boolean; onClick: () => void }[];
  };
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
      onNewChat: onNewChat
        ? () => onNewChatRef.current?.()
        : undefined,
      newChatLabel: onNewChat ? newChatLabel : undefined,
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
    onNewChat,
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
        "hidden w-full flex-row flex-nowrap items-center gap-2 @min-[420px]:gap-3 lg:flex",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Header ⋯ — opens an Apple-style frosted popover in the top-right.
 * While open the ⋯ is hidden; parent should also hide the surface toggle.
 */
export function MobilePanelActionsCluster({
  config,
  onCompose,
  onOpenChange,
}: {
  config: MobilePanelActionsConfig;
  onCompose: () => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const scope = config.scope;
  const layout = config.layout;
  const extras = config.extras ?? [];
  const composeLabel = config.newChatLabel ?? "New";

  const setOpen = (open: boolean) => {
    setMenuOpen(open);
    onOpenChange?.(open);
    if (open) {
      try {
        getNativeCapabilities().haptics.impact("select");
      } catch {
        /* never block */
      }
    }
  };

  const close = () => setOpen(false);

  return (
    <>
      {!menuOpen ? (
        <button
          type="button"
          aria-label={config.connector ? "Connector actions" : "Space actions"}
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className={mobileChromeButtonClass}
        >
          <Ellipsis className="h-5 w-5" strokeWidth={1.8} />
        </button>
      ) : (
        <span className="inline-flex h-11 w-11 shrink-0" aria-hidden />
      )}

      <MobileHeaderActionsPopover open={menuOpen} onClose={close}>
        <div className="flex flex-col">
          {config.connector ? (
            <PopoverGroup>
              {config.connector.actions.map(({ label, icon: Icon, disabled, onClick }) => (
                <PopoverRow
                  key={label}
                  icon={Icon}
                  label={label}
                  disabled={disabled}
                  destructive={/disconnect|uninstall|remove|delete/i.test(label)}
                  onClick={() => {
                    close();
                    onClick();
                  }}
                />
              ))}
              {config.connector.controls}
            </PopoverGroup>
          ) : config.onNewChat ? (
            <PopoverGroup>
              <SheetAction
                icon={SquarePen}
                label={composeLabel}
                onClick={() => {
                  close();
                  onCompose();
                }}
              />
            </PopoverGroup>
          ) : null}
          {layout ? (
            <PopoverGroup>
              <PopoverRow
                icon={LayoutGrid}
                label="Cards"
                selected={layout.value === "cards"}
                onClick={() => layout.onChange("cards")}
              />
              <PopoverRow
                icon={List}
                label="List"
                selected={layout.value === "list"}
                onClick={() => layout.onChange("list")}
              />
            </PopoverGroup>
          ) : null}
          {scope ? (
            <PopoverGroup>
              {scope.options.map((item) => (
                <PopoverRow
                  key={item.id}
                  label={item.label}
                  selected={scope.value === item.id}
                  onClick={() => scope.onChange(item.id)}
                />
              ))}
            </PopoverGroup>
          ) : null}
          {extras.length ? (
            <PopoverGroup>
              {extras.map((item) => (
                <PopoverRow
                  key={item.id}
                  label={item.label}
                  selected={item.active}
                  onClick={() => {
                    item.onClick();
                    close();
                  }}
                />
              ))}
            </PopoverGroup>
          ) : null}
        </div>
      </MobileHeaderActionsPopover>
    </>
  );
}

function PopoverGroup({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-black/8 py-1 last:border-b-0 dark:border-white/10">
      {children}
    </div>
  );
}

function PopoverRow({
  icon: Icon,
  label,
  selected,
  destructive,
  disabled,
  onClick,
}: {
  icon?: typeof SquarePen;
  label: string;
  selected?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[12px] px-2.5 py-2.5 text-left text-[15px] tracking-[-0.01em] transition-colors",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : selected
            ? "bg-muted/80 font-medium"
            : "hover:bg-muted/60",
        disabled && "opacity-40",
      )}
    >
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
        {selected ? <Check className="h-3.5 w-3.5" strokeWidth={2.2} /> : null}
      </span>
      {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
