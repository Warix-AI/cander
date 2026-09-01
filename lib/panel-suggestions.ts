import type { LucideIcon } from "lucide-react";
import { Hammer, Search } from "lucide-react";
import { SHOW_STUDIO_NAV } from "@/lib/spaces";
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
  const items: PanelChoice[] = [
    {
      id: "build",
      label: "Build",
      hint: "Start a build with this chat",
      space: "build",
      icon: Hammer,
    },
  ];
  if (SHOW_STUDIO_NAV) {
    items.push({
      id: "explore",
      label: "Studio",
      hint: "Start a search with this chat",
      space: "research",
      icon: Search,
    });
  }
  return items;
}
