import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Image as ImageIcon,
  Search,
} from "lucide-react";
import type { ProjectKind } from "@/lib/space-entities";
import type { SpaceId } from "@/lib/types";

export type CanvasStartAction = "quick-search" | "create-project";

export type CanvasStartOption = {
  id: string;
  label: string;
  summary: string;
  action: CanvasStartAction;
  icon: LucideIcon;
  kind?: ProjectKind;
  space?: SpaceId;
  title?: string;
  disabled?: boolean;
};

/**
 * Shared Canvas starts — right-panel “What would you like to do?”,
 * NewCanvasMenu, and orphan-recents Start in the composer +.
 */
export function canvasStartOptions(): CanvasStartOption[] {
  return [
    {
      id: "search",
      label: "Search",
      summary: "Collect what you find",
      action: "create-project",
      icon: Search,
      kind: "research",
      space: "research",
      title: "Search",
    },
    {
      id: "image",
      label: "Image",
      summary: "Generate and edit images",
      action: "create-project",
      icon: ImageIcon,
      kind: "general",
      space: "studio",
      title: "Image project",
    },
    {
      id: "agent",
      label: "Expert",
      summary: "Scheduled workflows and tool-heavy tasks",
      action: "create-project",
      icon: Bot,
      kind: "automation",
      space: "build",
      title: "Expert",
      disabled: true,
    },
  ];
}
