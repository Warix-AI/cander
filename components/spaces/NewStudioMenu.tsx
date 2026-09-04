"use client";

/**
 * Studio create menu — re-exports Create menu for leftover imports.
 * Prefer `@/components/spaces/NewCreateMenu`.
 */
export {
  NewCreateMenu as NewStudioMenu,
  CREATE_MENU_OPTIONS,
} from "@/components/spaces/NewCreateMenu";

export type { CreateStart as StudioStart } from "@/components/spaces/NewCreateMenu";

/** @deprecated Prefer CREATE_MENU_OPTIONS image entry. */
export const STUDIO_CREATE_OPTIONS = [
  {
    id: "project" as const,
    label: "Image",
    summary: "Generate and edit images",
    kind: "general" as const,
    title: "Image project",
  },
];
