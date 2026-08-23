"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import {
  appearanceToCss,
  getAppearanceSnapshot,
  subscribeAppearance,
  syncAppearanceSideEffects,
  useAppearance,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

/** Applies live appearance CSS vars to a scoped subtree. */
export function AppearanceScope({
  children,
  className,
  syncSideEffects = false,
}: {
  children: ReactNode;
  className?: string;
  /** Sync html.dark + shell chrome (app shell only). */
  syncSideEffects?: boolean;
}) {
  const appearance = useAppearance();
  const css = appearanceToCss(appearance);

  useEffect(() => {
    if (!syncSideEffects) return;
    syncAppearanceSideEffects(getAppearanceSnapshot());
    return subscribeAppearance(() => {
      syncAppearanceSideEffects(getAppearanceSnapshot());
    });
  }, [syncSideEffects]);

  const style = {
    ["--font-size-app" as string]: css.fontSize,
    ["--font-sans" as string]: css.fontSans,
    ["--letter-spacing" as string]: css.letterSpacing,
    ["--density" as string]: css.density,
    ["--radius" as string]: css.radius,
    ["--motion" as string]: css.motion,
    ["--app-hue" as string]: css.hue,
    ["--app-chroma" as string]: css.chroma,
    ["--app-accent-chroma" as string]: css.accentChroma,
  } as CSSProperties;

  return (
    <div
      className={cn("courier-app-appearance", className)}
      data-motion={css.motionMode}
      data-theme={css.theme}
      data-palette={Number(css.chroma) === 0 ? "mono" : "tint"}
      data-shell={css.shell}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * App-shell wrapper: appearance vars + theme/shell sync.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  return (
    <AppearanceScope
      syncSideEffects
      className="relative flex h-svh min-h-0 flex-1 flex-col overflow-hidden"
    >
      {children}
    </AppearanceScope>
  );
}
