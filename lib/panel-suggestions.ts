import type { LucideIcon } from "lucide-react";
import { Clapperboard, Hammer, Home } from "lucide-react";
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
      id: "home",
      label: "Home",
      hint: "Open Home with this chat",
      space: "research",
      icon: Home,
    },
    {
      id: "build",
      label: "Build",
      hint: "Start a build with this chat",
      space: "build",
      icon: Hammer,
    },
    {
      id: "studio",
      label: "Studio",
      hint: "Open Studio with this chat",
      space: "studio",
      icon: Clapperboard,
    },
  ];
}
