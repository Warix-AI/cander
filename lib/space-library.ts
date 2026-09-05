export const spaceLibrarySpaces = ["build", "research", "studio"] as const;

export type SpaceLibraryId = (typeof spaceLibrarySpaces)[number];

export function isSpaceLibrarySpace(id: string) {
  return (spaceLibrarySpaces as readonly string[]).includes(id);
}

export const spaceLibraryLabels: Record<SpaceLibraryId, string> = {
  build: "Canvas library",
  research: "Canvas library",
  studio: "Canvas library",
};

export function spaceLibraryLabel(id: SpaceLibraryId) {
  return spaceLibraryLabels[id];
}
