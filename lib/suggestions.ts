import { prompts } from "./data";
import type { SpaceId } from "./types";

export type HomeSuggestion = {
  id: string;
  label: string;
  space: SpaceId;
};

const HOME_SPACES: SpaceId[] = ["work", "build", "research"];

/** Three landing chips — one per main space: Work, Build, Explore. */
export function homeSuggestions(): HomeSuggestion[] {
  return HOME_SPACES.map((space) => {
    const match = prompts.find((item) => item.space === space);
    if (match) return match;
    return {
      id: `home-${space}`,
      label: "Start a conversation.",
      space,
    };
  });
}
