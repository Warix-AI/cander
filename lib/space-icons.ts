import {
  Blocks,
  Briefcase,
  Globe,
  Hammer,
  History,
  Search,
} from "lucide-react";
import { isExtraNavId, type SidebarNavId } from "./spaces";
import type { SpaceId } from "./types";

export const spaceIcons: Record<SpaceId, typeof Hammer> = {
  work: Briefcase,
  build: Hammer,
  research: Search,
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
> = {
  work: {
    headline: "Work",
    detail: "Inbox, calendar, and customers — what needs you today.",
  },
  build: {
    headline: "Build",
    detail: "Apps, sites, and agents — preview on the right.",
  },
  research: {
    headline: "Explore",
    detail: "Sources, notes, and reports — save what you find.",
  },
};
