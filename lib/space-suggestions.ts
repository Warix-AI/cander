import { workBriefActions } from "@/lib/work-catalog";
import { prompts } from "@/lib/data";
import type { SpaceId } from "@/lib/types";

export type SpaceSuggestion = {
  id: string;
  /** Short text shown on the chip. */
  label: string;
  /** Full message sent when the chip is clicked. */
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

  if (spaceId === "personal") {
    return [
      {
        id: "personal-today",
        label: "Today",
        prompt: "What’s on my plate today?",
      },
      {
        id: "personal-goals",
        label: "Goals",
        prompt: "How are my goals looking this quarter?",
      },
      {
        id: "personal-car",
        label: "Car",
        prompt: "Anything due on the car — service, insurance, or registration?",
      },
      {
        id: "personal-week",
        label: "Due this week",
        prompt: "What’s due this week that I shouldn’t miss?",
      },
    ];
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

  if (spaceId === "studio") {
    return [
      {
        id: "studio-image",
        label: "Hero image",
        prompt: "Generate a hero image for this launch.",
      },
      {
        id: "studio-video",
        label: "Product video",
        prompt: "Storyboard a short product video.",
      },
      {
        id: "studio-edit",
        label: "Retouch still",
        prompt: "Retouch this still and export variants.",
      },
    ];
  }

  if (spaceId === "research") {
    return [
      {
        id: "research-landscape",
        label: "Competitors",
        prompt: "Research competitors and summarize the landscape.",
      },
      {
        id: "research-sources",
        label: "Find sources",
        prompt: "Find sources I can cite for pricing claims.",
      },
      {
        id: "research-brief",
        label: "Research brief",
        prompt: "Turn my notes into a short research brief.",
      },
    ];
  }

  return prompts
    .filter((item) => item.space === spaceId)
    .slice(0, 3)
    .map((item) => ({ id: item.id, label: item.label, prompt: item.label }));
}
