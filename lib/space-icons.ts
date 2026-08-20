import {
  BarChart3,
  Blocks,
  BookOpen,
  Briefcase,
  CalendarClock,
  Clapperboard,
  Cpu,
  Files,
  Globe,
  Hammer,
  HeartPulse,
  History,
  KeyRound,
  LayoutGrid,
  Rocket,
  ScrollText,
  Search,
  Server,
  Sparkles,
  UserRound,
  Wallet,
  Waypoints,
} from "lucide-react";
import { isExtraNavId, type SidebarNavId } from "./spaces";
import type { PlatformNav, SpaceId } from "./types";

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

export const platformNavIcons: Record<PlatformNav, typeof Hammer> = {
  overview: LayoutGrid,
  hosting: Server,
  models: Cpu,
  api: Waypoints,
  keys: KeyRound,
  deployments: Rocket,
  logs: ScrollText,
  usage: BarChart3,
  docs: BookOpen,
  recents: History,
};

export const spaceIconColor: Partial<Record<SpaceId, string>> = {};

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
  string
> = {
  work: "What should we take care of?",
  build: "What should we make?",
  studio: "What should we create?",
  research: "What should we understand?",
  personal: "What's going on?",
  skills: "What should this task do?",
  finances: "What should we look at in the books?",
  health: "What should we track?",
};
