import { prompts } from "./data";
import type { SpaceId } from "./types";

export type HomeSuggestion = {
  id: string;
  label: string;
  space: SpaceId;
};

export function homeSuggestions(): HomeSuggestion[] {
  return prompts.slice(0, 3);
}
