import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Bot,
  Globe,
  Image as ImageIcon,
  Layout,
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
};

/**
 * Shared Canvas starts — right-panel “What would you like to do?”,
 * NewCanvasMenu, and orphan-recents Start in the composer +.
 */
export function canvasStartOptions(): CanvasStartOption[] {
  return [
    {
      id: "quick-search",
      label: "Quick search",
      summary: "Browse the web",
      action: "quick-search",
      icon: Globe,
    },
    {
      id: "search",
      label: "Search project",
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
      id: "app",
      label: "App",
      summary: "Interactive app or tool",
      action: "create-project",
      icon: AppWindow,
      kind: "app",
      space: "build",
      title: "New App",
    },
    {
      id: "website",
      label: "Website",
      summary: "Marketing site or landing page",
      action: "create-project",
      icon: Layout,
      kind: "site",
      space: "build",
      title: "New Website",
    },
    {
      id: "agent",
      label: "Agent",
      summary: "Scheduled or triggered workflow",
      action: "create-project",
      icon: Bot,
      kind: "automation",
      space: "build",
      title: "New Agent",
    },
  ];
}
