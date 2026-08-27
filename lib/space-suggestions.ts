import { workBriefActions } from "@/lib/work-catalog";
import { prompts } from "@/lib/data";
import type { SpaceId } from "@/lib/types";

export type SpaceSuggestion = {
  id: string;
  label: string;
  prompt: string;
};

/** Chips shown above the composer when starting a chat in a Space. */
export function spaceChatSuggestions(
  spaceId: SpaceId | null | undefined,
): SpaceSuggestion[] {
  if (!spaceId) return [];

  if (spaceId === "work") {
    return workBriefActions.map((item) => ({
      id: item.id,
      label: item.label,
      prompt: item.prompt,
    }));
  }

  if (spaceId === "build") {
    return [
      {
        id: "build-app",
        label: "Internal tool",
        prompt: "Build a simple internal tool for my team.",
      },
      {
        id: "build-site",
        label: "Marketing site",
        prompt: "Start a clean marketing website.",
      },
      {
        id: "build-auto",
        label: "Weekday automation",
        prompt: "Set up an automation that runs every weekday.",
      },
    ];
  }

  if (spaceId === "research") {
    const researchPrompts = prompts.filter((item) => item.space === "research");
    return researchPrompts.slice(0, 4).map((item) => ({
      id: item.id,
      label: item.label.slice(0, 28),
      prompt: item.label,
    }));
  }

  return [];
}
