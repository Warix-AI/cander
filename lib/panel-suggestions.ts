import type { LucideIcon } from "lucide-react";
import { Hammer, Search } from "lucide-react";
import type { SpaceId } from "./types";

export type PanelChoice = {
  id: string;
  label: string;
  hint: string;
  space: SpaceId;
  icon: LucideIcon;
};

/** Right-panel picks when a new chat has no space yet. */
export function panelChoiceSuggestions(): PanelChoice[] {
  return [
    {
      id: "build",
      label: "Build",
      hint: "Start a build with this chat",
      space: "build",
      icon: Hammer,
    },
    {
      id: "explore",
      label: "Explore",
      hint: "Start a search with this chat",
      space: "research",
      icon: Search,
    },
  ];
}
