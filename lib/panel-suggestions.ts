import type { LucideIcon } from "lucide-react";
import { Compass, Brush } from "lucide-react";
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
      id: "explore",
      label: "Explore",
      hint: "Open Explore with this chat",
      space: "research",
      icon: Compass,
    },
    {
      id: "create",
      label: "Create",
      hint: "Open Create with this chat",
      space: "studio",
      icon: Brush,
    },
  ];
}
