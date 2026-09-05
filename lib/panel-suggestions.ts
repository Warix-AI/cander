import type { LucideIcon } from "lucide-react";
import { Brush } from "lucide-react";
import type { SpaceId } from "./types";
import { canvasStartOptions } from "./canvas-start-options";

export type PanelChoice = {
  id: string;
  label: string;
  hint: string;
  space: SpaceId;
  icon: LucideIcon;
};

/**
 * @deprecated Prefer canvasStartOptions() for New / Canvas starts.
 * Kept for callers that still expect a space-dock choice.
 */
export function panelChoiceSuggestions(): PanelChoice[] {
  return [
    {
      id: "canvas",
      label: "Canvas",
      hint: "Add to canvas chat",
      space: "studio",
      icon: Brush,
    },
  ];
}

export { canvasStartOptions };
