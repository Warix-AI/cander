"use client";

import { useCallback, useRef, type TouchEvent } from "react";
import { useApp } from "@/components/app/AppProvider";
import { canUseRightPanel } from "@/lib/right-panel";
import { useMobileShell } from "@/lib/use-media-query";

const SWIPE_MIN = 56;

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
    }) || view === "space";

  const onTouchStart = useCallback(
    (event: TouchEvent) => {
      if (!mobile) return;
      const touch = event.touches[0];
      if (!touch) return;
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      tracking.current = true;
    },
    [mobile],
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

      const withPanel =
        panelAvailable &&
        (panelMode !== "collapsed" || view === "space");

      // Swipe right → toward menu
      if (dx > 0) {
        if (mobileSurface === "panel") {
          setMobileSurface("chat");
          return;
        }
        if (mobileSurface === "chat") {
          setMobileSurface("menu");
        }
        return;
      }

      // Swipe left → toward panel / chat from menu
      if (dx < 0) {
        if (mobileSurface === "menu") {
          // Space browse with no chat → land on right panel, not empty chat.
          if (view === "space" && !drafting && !thread) {
            setMobileSurface("panel");
          } else {
            setMobileSurface("chat");
          }
          return;
        }
        if (mobileSurface === "chat" && withPanel) {
          if (panelMode === "collapsed") setPanelMode("split");
          setMobileSurface("panel");
        }
      }
    },
    [
      drafting,
      mobileSurface,
      panelAvailable,
      panelMode,
      setMobileSurface,
      setPanelMode,
      thread,
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
