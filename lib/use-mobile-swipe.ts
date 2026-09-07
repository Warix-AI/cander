"use client";

import { useCallback, useRef, type TouchEvent } from "react";
import { useApp } from "@/components/app/AppProvider";
import { canUseRightPanel } from "@/lib/right-panel";
import { dismissNativeKeyboard } from "@/lib/mobile-shell";
import { useMobileShell } from "@/lib/use-media-query";

/** Distance to count as a horizontal surface change. */
const SWIPE_MIN = 40;
/** Require horizontal travel to beat vertical by this ratio (more forgiving). */
const SWIPE_BIAS = 0.85;

function isChromeTarget(
  target: EventTarget | null,
  surface: "menu" | "chat" | "panel",
) {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-allow-swipe]")) return false;
  // Always block the app chrome / explicit no-swipe zones.
  if (
    target.closest(
      "header, [data-no-swipe], [role='tab'], [role='tablist']",
    )
  ) {
    return true;
  }
  // Panel content is full of cards/buttons — still allow mid-screen swipes
  // so Canvas → chat feels as easy as chat → menu.
  if (surface === "panel" || surface === "menu") return false;
  return Boolean(target.closest("button, a"));
}

/**
 * Horizontal swipe across menu · chat · panel.
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

  const onTouchStart = useCallback(
    (event: TouchEvent) => {
      if (!mobile) return;
      if (
        mobileSurface !== "menu" &&
        isChromeTarget(event.target, mobileSurface)
      ) {
        tracking.current = false;
        return;
      }
      if (
        mobileSurface === "menu" &&
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        tracking.current = false;
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      tracking.current = true;
    },
    [mobile, mobileSurface],
  );

  const onTouchEnd = useCallback(
    (event: TouchEvent) => {
      if (!tracking.current) return;
      tracking.current = false;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * SWIPE_BIAS) {
        return;
      }

      const goSurface = (next: "menu" | "chat" | "panel") => {
        if (next !== "chat") dismissNativeKeyboard();
        setMobileSurface(next);
      };

      // Swipe right → panel → chat → menu
      if (dx > 0) {
        if (mobileSurface === "panel") {
          goSurface("chat");
          return;
        }
        if (mobileSurface === "chat") {
          goSurface("menu");
        }
        return;
      }

      // Swipe left → menu → chat → panel
      if (dx < 0) {
        if (mobileSurface === "menu") {
          goSurface("chat");
          return;
        }
        if (mobileSurface === "chat" && panelAvailable) {
          if (panelMode === "collapsed") setPanelMode("split");
          goSurface("panel");
        }
      }
    },
    [
      mobileSurface,
      panelAvailable,
      panelMode,
      setMobileSurface,
      setPanelMode,
    ],
  );

  if (!mobile) {
    return {
      onTouchStart: undefined,
      onTouchEnd: undefined,
    };
  }

  return { onTouchStart, onTouchEnd };
}
