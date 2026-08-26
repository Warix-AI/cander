import {
  Blocks,
  Briefcase,
  CalendarClock,
  Clapperboard,
  Files,
  Globe,
  Hammer,
  HeartPulse,
  History,
  Search,
  Sparkles,
  UserRound,
  Wallet,
} from "lucide-react";
import { isExtraNavId, type SidebarNavId } from "./spaces";
import type { SpaceId } from "./types";

export const spaceIcons: Record<SpaceId, typeof Hammer> = {
  work: Briefcase,
  build: Hammer,
  studio: Clapperboard,
  research: Search,
  personal: UserRound,
  files: Files,
  skills: Sparkles,
  finances: Wallet,
  health: HeartPulse,
  connectors: Blocks,
  scheduled: CalendarClock,
};

export const extraNavIcons: Record<
  "browser" | "recents",
  typeof Hammer
> = {
  browser: Globe,
  recents: History,
};

export function navIcon(id: SidebarNavId) {
  return isExtraNavId(id) ? extraNavIcons[id] : spaceIcons[id];
}

export const extraNavLabels: Record<"browser" | "recents", string> = {
  browser: "Browser",
  recents: "Recents",
};

export function spaceIconTint(_id?: SpaceId | null) {
  return "text-muted-foreground";
}

export const chatSpaceCopy: Record<
  | "work"
  | "build"
  | "studio"
  | "research"
  | "personal"
  | "skills"
  | "finances"
  | "health",
  { headline: string; detail: string }
> = {
  work: {
    headline: "Starting something new?",
    detail: "Describe what you want to take care of.",
  },
  build: {
    headline: "Starting a new project?",
    detail: "Describe what you want to build.",
  },
  studio: {
    headline: "Starting something new?",
    detail: "Describe what you want to create.",
  },
  research: {
    headline: "Starting something new?",
    detail: "Describe what you want to explore.",
  },
  personal: {
    headline: "Starting something new?",
    detail: "Describe what's going on.",
  },
  skills: {
    headline: "Starting something new?",
    detail: "Describe what this task should do.",
  },
  finances: {
    headline: "Starting something new?",
    detail: "Describe what you want to look at.",
  },
  health: {
    headline: "Starting something new?",
    detail: "Describe what you want to track.",
  },
};
