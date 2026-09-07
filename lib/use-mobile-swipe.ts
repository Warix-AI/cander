"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/components/app/AppProvider";
import { canUseRightPanel } from "@/lib/right-panel";
import { dismissNativeKeyboard } from "@/lib/mobile-shell";
import { useMobileShell } from "@/lib/use-media-query";
import type { MobileSurface } from "@/lib/types";

/** Distance to count as a horizontal surface change. */
const SWIPE_MIN = 48;
/** Horizontal must beat vertical by this ratio. */
const SWIPE_BIAS = 0.65;
/** Once horizontal travel exceeds this, lock the axis. */
const AXIS_LOCK = 14;
/** Ignore further swipes while the pager/menu animation settles. */
const COMMIT_COOLDOWN_MS = 520;

/**
 * Module-level guards so duplicate hook mounts (or touchend+touchcancel)
 * can never advance more than one screen per gesture.
 */
let gestureCommitted = false;
let swipeLockUntil = 0;

function isBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-allow-swipe]")) return false;
  return Boolean(
    target.closest("header, [data-no-swipe], [role='tablist']"),
  );
}

function nextSurface(
  from: MobileSurface,
  dx: number,
  panelAvailable: boolean,
): MobileSurface | null {
  if (dx > 0) {
    if (from === "panel") return "chat";
    if (from === "chat") return "menu";
    return null;
  }
  if (dx < 0) {
    if (from === "menu") return "chat";
    if (from === "chat" && panelAvailable) return "panel";
    return null;
  }
  return null;
}

/**
 * Horizontal swipe across menu · chat · panel.
 * One gesture → exactly one adjacent surface (never skips chat).
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
  const originSurface = useRef<MobileSurface>(mobileSurface);
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
      if (performance.now() < swipeLockUntil) {
        tracking.current = false;
        return;
      }
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
      originSurface.current = surface;
      axis.current = "none";
      gestureCommitted = false;
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

    const finishGesture = (event: TouchEvent) => {
      if (!tracking.current) return;
      tracking.current = false;
      if (gestureCommitted) return;
      if (performance.now() < swipeLockUntil) return;

      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;
      const locked = axis.current;
      axis.current = "none";

      if (locked === "v") return;
      if (Math.abs(dx) < SWIPE_MIN) return;
      if (locked !== "h" && Math.abs(dx) < Math.abs(dy) * SWIPE_BIAS) return;

      const from = originSurface.current;
      const next = nextSurface(from, dx, panelAvailableRef.current);
      if (!next || next === from) return;

      // Claim this gesture before setState so a second listener can't step again.
      gestureCommitted = true;
      swipeLockUntil = performance.now() + COMMIT_COOLDOWN_MS;
      surfaceRef.current = next;

      if (next === "panel" && panelModeRef.current === "collapsed") {
        setPanelModeRef.current("split");
      }
      if (next !== "chat") dismissNativeKeyboard();
      setMobileSurfaceRef.current(next);
    };

    const opts: AddEventListenerOptions = { capture: true, passive: true };
    document.addEventListener("touchstart", onTouchStart, opts);
    document.addEventListener("touchmove", onTouchMove, opts);
    document.addEventListener("touchend", finishGesture, opts);
    document.addEventListener("touchcancel", finishGesture, opts);
    return () => {
      document.removeEventListener("touchstart", onTouchStart, opts);
      document.removeEventListener("touchmove", onTouchMove, opts);
      document.removeEventListener("touchend", finishGesture, opts);
      document.removeEventListener("touchcancel", finishGesture, opts);
    };
  }, [mobile]);

  return {
    onTouchStart: undefined as undefined,
    onTouchEnd: undefined as undefined,
  };
}
