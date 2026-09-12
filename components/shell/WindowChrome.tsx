"use client";

import { NavToggle } from "@/components/shell/NavToggle";
import { ShellWindowChromeBar } from "@/components/shell/ShellWindowChromeBar";
import { useApp } from "@/components/app/AppProvider";

export function WindowChrome({
  clearTrafficLights = false,
  hideHistory = false,
  className,
}: {
  /** Pad past macOS traffic lights when chrome shares their row. */
  clearTrafficLights?: boolean;
  /** Hide header actions (e.g. floating sidebar peek over project tabs). */
  hideHistory?: boolean;
  className?: string;
}) {
  const { openOverlay, canGoBack, canGoForward, goBack, goForward } = useApp();

  return (
    <ShellWindowChromeBar
      clearTrafficLights={clearTrafficLights}
      hideHistory={hideHistory}
      className={className}
      leading={<NavToggle />}
      onSearch={() => openOverlay("search")}
      onBack={goBack}
      onForward={goForward}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
    />
  );
}
