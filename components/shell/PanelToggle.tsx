"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { PanelRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { canUseRightPanel } from "@/lib/right-panel";
import { useShellStyle } from "@/lib/shell-chrome";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/**
 * Electron sticky-hover fix: never rely on CSS :hover for chrome icons.
 * Clear hover whenever the pointer is outside the control (native WebViews
 * often skip pointerleave when the cursor crosses into them).
 */
function useChromeHover() {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!hovered) return;
    const clearIfOutside = (event: globalThis.PointerEvent) => {
      const el = ref.current;
      if (!el) {
        setHovered(false);
        return;
      }
      const rect = el.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inside) setHovered(false);
    };
    const clear = () => setHovered(false);
    window.addEventListener("pointermove", clearIfOutside, true);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("pointermove", clearIfOutside, true);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, [hovered]);

  return {
    ref,
    hovered,
    onPointerEnter: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      setHovered(true);
    },
    onPointerLeave: () => setHovered(false),
    onPointerCancel: () => setHovered(false),
    onBlur: () => setHovered(false),
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

  return (
    <button
      ref={hover.ref}
      type="button"
      aria-label={open ? "Close right panel" : "Open right panel"}
      onClick={() => toggleRightPanel()}
      onPointerEnter={hover.onPointerEnter}
      onPointerLeave={hover.onPointerLeave}
      onPointerCancel={hover.onPointerCancel}
      onBlur={hover.onBlur}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150",
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
    <div className="flex h-11 shrink-0 items-center justify-end gap-1 px-3">
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

  if (mobile || !canPanel) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute top-0 right-0 z-50 hidden h-11 items-center gap-1 px-3 lg:flex",
        floating ? "pt-3 pr-3" : "pt-0 pr-3",
      )}
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
      onClick={onClick}
      onPointerEnter={hover.onPointerEnter}
      onPointerLeave={hover.onPointerLeave}
      onPointerCancel={hover.onPointerCancel}
      onBlur={hover.onBlur}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150",
        hover.hovered && "bg-black/[0.06] text-foreground dark:bg-white/[0.1]",
      )}
    >
      {children}
    </button>
  );
}
