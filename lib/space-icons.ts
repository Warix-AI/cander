import {
  Blocks,
  Briefcase,
  Brush,
  Globe,
  Hammer,
  History,
} from "lucide-react";
import { isExtraNavId, type SidebarNavId } from "./spaces";
import type { SpaceId } from "./types";

export const spaceIcons: Record<SpaceId, typeof Hammer> = {
  home: Brush, // legacy alias — same glyph as Canvas
  work: Briefcase,
  build: Hammer,
  research: Brush,
  /** Canvas — brush. */
  studio: Brush,
};

export const extraNavIcons: Record<
  "browser" | "recents" | "connectors",
  typeof Hammer
> = {
  browser: Globe,
  recents: History,
  connectors: Blocks,
};

export function navIcon(id: SidebarNavId) {
  return isExtraNavId(id) ? extraNavIcons[id] : spaceIcons[id];
}

export const extraNavLabels: Record<
  "browser" | "recents" | "connectors",
  string
> = {
  browser: "Browser",
  recents: "Recents",
  connectors: "Connectors",
};

export function spaceIconTint(_id?: SpaceId | null) {
  return "text-muted-foreground";
}

export const chatSpaceCopy: Partial<
  Record<SpaceId, { headline: string; detail: string }>
> = {};
