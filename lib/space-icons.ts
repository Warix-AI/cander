import {
  Blocks,
  Briefcase,
  Clapperboard,
  Globe,
  Hammer,
  History,
  Home,
} from "lucide-react";
import { isExtraNavId, type SidebarNavId } from "./spaces";
import type { SpaceId } from "./types";

export const spaceIcons: Record<SpaceId, typeof Hammer> = {
  home: Home, // legacy alias — same glyph as research Home
  work: Briefcase,
  build: Hammer,
  research: Home,
  studio: Clapperboard,
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
