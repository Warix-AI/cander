"use client";

import { useCallback, useRef, type TouchEvent } from "react";
import { useApp } from "@/components/app/AppProvider";
import { canUseRightPanel } from "@/lib/right-panel";
import { useMobileShell } from "@/lib/use-media-query";

const EDGE_PX = 28;
const SWIPE_MIN = 56;

/**
 * Horizontal swipe for mobile shell:
 * - swipe right from left edge / on chat → open menu
 * - swipe left on chat → open right panel (when available)
 * - swipe right on panel → back to chat
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
    sidebarOpen,
    setSidebarOpen,
    mobileSurface,
    setMobileSurface,
    panelMode,
    setPanelMode,
  } = useApp();

  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const fromEdge = useRef(false);

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
      if (!mobile || sidebarOpen) return;
      const touch = event.touches[0];
      if (!touch) return;
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      fromEdge.current = touch.clientX <= EDGE_PX;
      tracking.current = true;
    },
    [mobile, sidebarOpen],
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

      const showingPanel =
        panelMode !== "collapsed" && mobileSurface === "panel";

      // Swipe right → menu (from edge or chat) or back to chat from panel
      if (dx > 0) {
        if (showingPanel) {
          setMobileSurface("chat");
          return;
        }
        if (fromEdge.current || mobileSurface === "chat") {
          setSidebarOpen(true);
        }
        return;
      }

      // Swipe left → open / show panel
      if (dx < 0 && panelAvailable) {
        if (panelMode === "collapsed") setPanelMode("split");
        setMobileSurface("panel");
      }
    },
    [
      mobileSurface,
      panelAvailable,
      panelMode,
      setMobileSurface,
      setPanelMode,
      setSidebarOpen,
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
