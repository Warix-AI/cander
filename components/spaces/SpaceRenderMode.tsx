"use client";

import { createContext, useContext, type ReactNode } from "react";

export type SpaceRenderMode = "page" | "panel";

const SpaceRenderModeContext = createContext<SpaceRenderMode>("page");

export function SpaceRenderModeProvider({
  mode,
  children,
}: {
  mode: SpaceRenderMode;
  children: ReactNode;
}) {
  return (
    <SpaceRenderModeContext.Provider value={mode}>
      {children}
    </SpaceRenderModeContext.Provider>
  );
}

export function useSpaceRenderMode() {
  return useContext(SpaceRenderModeContext);
}
