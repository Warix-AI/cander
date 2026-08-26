import type { LucideIcon } from "lucide-react";
import { Globe, Hammer, Search, Briefcase } from "lucide-react";
import type { ResearchTool, SpaceId } from "./types";

export type PanelChoice = {
  id: string;
  label: string;
  hint: string;
  space: SpaceId;
  icon: LucideIcon;
  researchTool?: ResearchTool;
};

/** Right-panel picks when chat has no space yet. */
export function panelChoiceSuggestions(): PanelChoice[] {
  return [
    {
      id: "work",
      label: "Work",
      hint: "Inbox, meetings, and follow-ups",
      space: "work",
      icon: Briefcase,
    },
    {
      id: "build",
      label: "Build",
      hint: "Apps, sites, and automations",
      space: "build",
      icon: Hammer,
    },
    {
      id: "explore",
      label: "Explore",
      hint: "Research with sources",
      space: "research",
      icon: Search,
      researchTool: "sources",
    },
    {
      id: "browser",
      label: "Browser",
      hint: "Search and browse the web",
      space: "research",
      icon: Globe,
      researchTool: "browser",
    },
  ];
}
