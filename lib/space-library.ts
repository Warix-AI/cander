import type { SpaceId } from "./types";

export const spaceLibrarySpaces = ["build", "studio", "research"] as const;

export type SpaceLibraryId = (typeof spaceLibrarySpaces)[number];

export function isSpaceLibrarySpace(
  id: SpaceId | null | undefined,
): id is SpaceLibraryId {
  return !!id && spaceLibrarySpaces.includes(id as SpaceLibraryId);
}

export function spaceLibraryLabel(id: SpaceLibraryId) {
  const labels: Record<SpaceLibraryId, string> = {
    build: "Build library",
    studio: "Studio library",
    research: "Research library",
  };
  return labels[id];
}
