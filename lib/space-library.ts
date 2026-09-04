export const spaceLibrarySpaces = ["build", "research", "studio"] as const;

export type SpaceLibraryId = (typeof spaceLibrarySpaces)[number];

export function isSpaceLibrarySpace(id: string) {
  return (spaceLibrarySpaces as readonly string[]).includes(id);
}

export const spaceLibraryLabels: Record<SpaceLibraryId, string> = {
  build: "Create library",
  research: "Explore library",
  studio: "Create library",
};

export function spaceLibraryLabel(id: SpaceLibraryId) {
  return spaceLibraryLabels[id];
}
