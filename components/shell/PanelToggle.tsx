"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { PanelRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { canUseRightPanel } from "@/lib/right-panel";
import { useShellStyle } from "@/lib/shell-chrome";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

type ClearFn = () => void;
const chromeHoverClears = new Set<ClearFn>();

/** Call from a chrome row's onPointerLeave so fills can't stick after leaving the bar. */
export function clearBrowserChromeHovers() {
  for (const clear of chromeHoverClears) clear();
}

/**
 * Hover for browser chrome icons.
 *
 * Never use CSS :hover fills here — Electron keeps :hover stuck after the
 * cursor enters a native BrowserView. JS hover is cleared on leave, on any
 * pointerover of another DOM node, on click, and when the chrome row fires
 * clearBrowserChromeHovers().
 */
function useChromeHover() {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [hovered, setHovered] = useState(false);

  const clear = useCallback(() => setHovered(false), []);

  useEffect(() => {
    chromeHoverClears.add(clear);
    return () => {
      chromeHoverClears.delete(clear);
    };
  }, [clear]);

  useEffect(() => {
    if (!hovered) return;
    const onOver = (event: Event) => {
      const el = ref.current;
      const target = event.target;
      if (!(el && target instanceof Node)) {
        clear();
        return;
      }
      if (el === target || el.contains(target)) return;
      clear();
    };
    // Capture: see moves onto other DOM nodes even if stopPropagation is used.
    document.addEventListener("pointerover", onOver, true);
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("pointerover", onOver, true);
      window.removeEventListener("blur", clear);
    };
  }, [hovered, clear]);

  return {
    ref,
    hovered,
    clear,
    onPointerEnter: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      setHovered(true);
    },
    onPointerLeave: clear,
    onPointerCancel: clear,
    onBlur: clear,
  };
}

export function PanelToggle({
  className,
  docked = false,
}: {
  className?: string;
  /** Floating dock when the panel is collapsed — matches TopRail / NavToggle styling. */
  docked?: boolean;
}) {
  const { panelMode, toggleRightPanel } = useApp();
  const open = panelMode !== "collapsed";
  const hover = useChromeHover();

  useEffect(() => {
    hover.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when open flips
  }, [open]);

  return (
    <button
      ref={hover.ref}
      type="button"
      aria-label={open ? "Close right panel" : "Open right panel"}
      onClick={() => {
        hover.clear();
        toggleRightPanel();
      }}
      onPointerEnter={hover.onPointerEnter}
      onPointerLeave={hover.onPointerLeave}
      onPointerCancel={hover.onPointerCancel}
      onBlur={hover.onBlur}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors duration-100",
        docked && "h-8 w-8 bg-background",
        hover.hovered &&
          (docked
            ? "bg-muted text-foreground"
            : "bg-black/[0.06] text-foreground dark:bg-white/[0.1]"),
        className,
      )}
    >
      <PanelRight className="h-3.5 w-3.5" strokeWidth={1.6} />
    </button>
  );
}

/** Top chrome inside the right panel — toggle anchored top-right, opposite the menu. */
export function PanelWindowChrome() {
  const mobile = useMobileShell();
  if (mobile) return null;

  return (
    <div
      className="flex h-11 shrink-0 items-center justify-end gap-1 px-3"
      onPointerLeave={clearBrowserChromeHovers}
    >
      <PanelToggle />
    </div>
  );
}

/** Fixed top-right toggle when the panel is collapsed but available. */
export function RightPanelToggleDock() {
  const {
    view,
    thread,
    drafting,
    spaceId,
    connectorId,
    projectId,
    jobId,
    skillId,
    panelMode,
  } = useApp();
  const mobile = useMobileShell();
  const floating = useShellStyle() === "floating";
  const canPanel = canUseRightPanel({
    view,
    thread,
    drafting,
    spaceId,
    connectorId,
    projectId,
    jobId,
    skillId,
  });

  // Only when collapsed — open layouts already host PanelToggle in chrome.
  // Leaving this mounted painted a permanent bg-background chip over the
  // header control and looked like a stuck hover.
  if (mobile || !canPanel || panelMode !== "collapsed") return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute top-0 right-0 z-50 hidden h-11 items-center gap-1 px-3 lg:flex",
        floating ? "pt-3 pr-3" : "pt-0 pr-3",
      )}
      onPointerLeave={clearBrowserChromeHovers}
    >
      <PanelToggle docked className="pointer-events-auto bg-background" />
    </div>
  );
}

export function BrowserChromeIconButton({
  "aria-label": ariaLabel,
  onClick,
  children,
}: {
  "aria-label": string;
  onClick: () => void;
  children: ReactNode;
}) {
  const hover = useChromeHover();
  return (
    <button
      ref={hover.ref}
      type="button"
      aria-label={ariaLabel}
      onClick={() => {
        hover.clear();
        onClick();
      }}
      onPointerEnter={hover.onPointerEnter}
      onPointerLeave={hover.onPointerLeave}
      onPointerCancel={hover.onPointerCancel}
      onBlur={hover.onBlur}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors duration-100",
        hover.hovered &&
          "bg-black/[0.06] text-foreground dark:bg-white/[0.1]",
      )}
    >
      {children}
    </button>
  );
}
