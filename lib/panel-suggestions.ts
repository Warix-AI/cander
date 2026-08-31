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
      hint: "Start a project from this chat",
      space: "build",
      icon: Hammer,
    },
    {
      id: "explore",
      label: "Explore",
      hint: "Open a search session from this chat",
      space: "research",
      icon: Search,
    },
  ];
}

export type PanelDefaultChoice = {
  id: string;
  label: string;
  space: SpaceId;
};

/** Set the current draft as the sidebar default for a space. */
export function panelDefaultChatChoices(): PanelDefaultChoice[] {
  return [
    { id: "default-build", label: "Build", space: "build" },
    { id: "default-explore", label: "Explore", space: "research" },
  ];
}
