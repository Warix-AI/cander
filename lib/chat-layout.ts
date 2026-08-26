"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useShellStyle } from "@/lib/shell-chrome";

const PANEL_SLIDE_MS = 500;

/** Center chat/composer in the canvas when the right panel is closed. */
export function useChatCanvasCentered() {
  const floating = useShellStyle() === "floating";
  const { panelMode } = useApp();
  const [centered, setCentered] = useState(
    () => floating && panelMode === "collapsed",
  );

  useEffect(() => {
    if (panelMode === "collapsed") {
      setCentered(true);
      return;
    }
    const id = window.setTimeout(() => setCentered(false), PANEL_SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [panelMode]);

  return { floating, centered: floating && centered };
}

export { PANEL_SLIDE_MS };
