"use client";

import { useCallback, useRef, type TouchEvent } from "react";
import { useApp } from "@/components/app/AppProvider";
import { canUseRightPanel } from "@/lib/right-panel";
import { dismissNativeKeyboard } from "@/lib/mobile-shell";
import { isChatSpace } from "@/lib/spaces";
import { useMobileShell } from "@/lib/use-media-query";

const SWIPE_MIN = 56;

function isChromeTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  // Inputs always block; when the menu is open we still want edge swipes over rows.
  if (target.closest("input, textarea, select, [contenteditable='true']")) {
    return true;
  }
  if (target.closest("[data-allow-swipe]")) return false;
  return Boolean(
    target.closest(
      "header, button, a, [role='tab'], [role='tablist'], [data-no-swipe]",
    ),
  );
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
    openSpaceChat,
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
    }) || view === "space";

  const onTouchStart = useCallback(
    (event: TouchEvent) => {
      if (!mobile) return;
      // Menu → chat swipes must work over menu rows / peek strip.
      if (mobileSurface !== "menu" && isChromeTarget(event.target)) {
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
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.15) {
        return;
      }

      const withPanel = panelAvailable;

      const goSurface = (next: "menu" | "chat" | "panel") => {
        if (next !== "chat") dismissNativeKeyboard();
        setMobileSurface(next);
      };

      // Swipe right → toward menu
      if (dx > 0) {
        if (mobileSurface === "panel") {
          if (projectId) {
            goSurface("chat");
          } else if (view === "space" && spaceId && isChatSpace(spaceId)) {
            openSpaceChat(spaceId);
          } else {
            goSurface("chat");
          }
          return;
        }
        if (mobileSurface === "chat") {
          goSurface("menu");
        }
        return;
      }

      // Swipe left → toward panel / chat from menu
      if (dx < 0) {
        if (mobileSurface === "menu") {
          goSurface("chat");
          return;
        }
        if (mobileSurface === "chat" && withPanel) {
          if (panelMode === "collapsed") setPanelMode("split");
          goSurface("panel");
        }
      }
    },
    [
      mobileSurface,
      openSpaceChat,
      panelAvailable,
      panelMode,
      projectId,
      setMobileSurface,
      setPanelMode,
      spaceId,
      view,
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
