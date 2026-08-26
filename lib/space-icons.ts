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

export const spaceIconColor: Partial<Record<SpaceId, string>> = {
  work: "text-blue-600 dark:text-blue-400",
  build: "text-orange-600 dark:text-orange-400",
  research: "text-green-600 dark:text-green-400",
};

export function spaceIconTint(id?: SpaceId | null) {
  if (id && spaceIconColor[id]) return spaceIconColor[id];
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
  string
> = {
  work: "What should we take care of?",
  build: "What should we make?",
  studio: "What should we create?",
  research: "What should we explore?",
  personal: "What's going on?",
  skills: "What should this task do?",
  finances: "What should we look at in the books?",
  health: "What should we track?",
};
