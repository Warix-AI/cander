export const spaceLibrarySpaces = ["build", "research", "studio"] as const;

export type SpaceLibraryId = (typeof spaceLibrarySpaces)[number];

export function isSpaceLibrarySpace(id: string) {
  return (spaceLibrarySpaces as readonly string[]).includes(id);
}

export const spaceLibraryLabels: Record<SpaceLibraryId, string> = {
  build: "Build library",
  research: "Home library",
  studio: "Studio library",
};

export function spaceLibraryLabel(id: SpaceLibraryId) {
  return spaceLibraryLabels[id];
}
