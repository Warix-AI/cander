"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/components/app/AppProvider";
import { canUseRightPanel } from "@/lib/right-panel";
import { dismissNativeKeyboard } from "@/lib/mobile-shell";
import { useMobileShell } from "@/lib/use-media-query";

/** Distance to count as a horizontal surface change. */
const SWIPE_MIN = 28;
/** Horizontal must beat vertical by this ratio (forgiving for mid-screen drags). */
const SWIPE_BIAS = 0.55;
/** Once horizontal travel exceeds this, lock the axis so slight vertical noise can't cancel. */
const AXIS_LOCK = 12;

function isBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-allow-swipe]")) return false;
  // Only block true chrome — never panel/canvas content buttons.
  return Boolean(
    target.closest("header, [data-no-swipe], [role='tablist']"),
  );
}

/**
 * Horizontal swipe across menu · chat · panel.
 * Uses document capture so Canvas/panel controls can't swallow the gesture.
 */
export function useMobileSwipeGestures() {
  const mobile = useMobileShell();
  const {
    view,
    thread,
    drafting,
    spaceId,
    connectorId,
    projectId,
    jobId,
    skillId,
    mobileSurface,
    setMobileSurface,
    panelMode,
    setPanelMode,
  } = useApp();

  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const axis = useRef<"none" | "h" | "v">("none");
  const surfaceRef = useRef(mobileSurface);
  surfaceRef.current = mobileSurface;

  const panelAvailable =
    canUseRightPanel({
      view,
      thread,
      drafting,
      spaceId,
      connectorId,
      projectId,
      jobId,
      skillId,
    }) ||
    view === "space" ||
    Boolean(projectId) ||
    Boolean(connectorId);

  const panelAvailableRef = useRef(panelAvailable);
  panelAvailableRef.current = panelAvailable;
  const panelModeRef = useRef(panelMode);
  panelModeRef.current = panelMode;
  const setMobileSurfaceRef = useRef(setMobileSurface);
  setMobileSurfaceRef.current = setMobileSurface;
  const setPanelModeRef = useRef(setPanelMode);
  setPanelModeRef.current = setPanelMode;

  useEffect(() => {
    if (!mobile) return;

    const onTouchStart = (event: TouchEvent) => {
      if (isBlockedTarget(event.target)) {
        tracking.current = false;
        return;
      }
      const surface = surfaceRef.current;
      if (
        surface === "menu" &&
        event.target instanceof Element &&
        event.target.closest(
          "input, textarea, select, [contenteditable='true']",
        )
      ) {
        tracking.current = false;
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      axis.current = "none";
      tracking.current = true;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;
      if (axis.current === "none") {
        if (Math.abs(dx) >= AXIS_LOCK || Math.abs(dy) >= AXIS_LOCK) {
          axis.current =
            Math.abs(dx) >= Math.abs(dy) * SWIPE_BIAS ? "h" : "v";
        }
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!tracking.current) return;
      tracking.current = false;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;
      const locked = axis.current;
      axis.current = "none";

      if (locked === "v") return;
      if (Math.abs(dx) < SWIPE_MIN) return;
      if (locked !== "h" && Math.abs(dx) < Math.abs(dy) * SWIPE_BIAS) return;

      const surface = surfaceRef.current;
      const goSurface = (next: "menu" | "chat" | "panel") => {
        if (next !== "chat") dismissNativeKeyboard();
        setMobileSurfaceRef.current(next);
      };

      // Swipe right → panel → chat → menu
      if (dx > 0) {
        if (surface === "panel") {
          goSurface("chat");
          return;
        }
        if (surface === "chat") {
          goSurface("menu");
        }
        return;
      }

      // Swipe left → menu → chat → panel
      if (dx < 0) {
        if (surface === "menu") {
          goSurface("chat");
          return;
        }
        if (surface === "chat" && panelAvailableRef.current) {
          if (panelModeRef.current === "collapsed") {
            setPanelModeRef.current("split");
          }
          goSurface("panel");
        }
      }
    };

    const opts: AddEventListenerOptions = { capture: true, passive: true };
    document.addEventListener("touchstart", onTouchStart, opts);
    document.addEventListener("touchmove", onTouchMove, opts);
    document.addEventListener("touchend", onTouchEnd, opts);
    document.addEventListener("touchcancel", onTouchEnd, opts);
    return () => {
      document.removeEventListener("touchstart", onTouchStart, opts);
      document.removeEventListener("touchmove", onTouchMove, opts);
      document.removeEventListener("touchend", onTouchEnd, opts);
      document.removeEventListener("touchcancel", onTouchEnd, opts);
    };
  }, [mobile]);

  // React handlers no longer needed — capture listeners own the gesture.
  return {
    onTouchStart: undefined,
    onTouchEnd: undefined,
  };
}
