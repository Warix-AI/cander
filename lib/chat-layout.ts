"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useShellStyle } from "@/lib/shell-chrome";
import { useMobileShell } from "@/lib/use-media-query";

const PANEL_SLIDE_MS = 500;

/** Center chat/composer in the canvas when the right panel is closed. */
export function useChatCanvasCentered() {
  const floating = useShellStyle() === "floating";
  const mobile = useMobileShell();
  const { panelMode } = useApp();
  const [centered, setCentered] = useState(
    () => floating && panelMode === "collapsed",
  );

  useEffect(() => {
    if (mobile || panelMode === "collapsed") {
      queueMicrotask(() => setCentered(true));
      return;
    }
    const id = window.setTimeout(() => setCentered(false), PANEL_SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [panelMode, mobile]);

  return { floating, centered: mobile || (floating && centered) };
}

export { PANEL_SLIDE_MS };
