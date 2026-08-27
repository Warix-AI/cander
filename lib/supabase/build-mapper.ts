import type { ProjectFile } from "@/lib/space-entities";

export type ProjectFileRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  path: string;
  label: string | null;
  sort_order: number;
};

export type BrowserSessionRow = {
  profile_id: string;
  workspace_id: string;
  url: string;
  title: string;
  updated_at: string;
};

export function projectFileRowToFile(row: ProjectFileRow): ProjectFile {
  return {
    path: row.path,
    label: row.label ?? undefined,
  };
}

export function projectFileToRow(
  file: ProjectFile,
  workspaceId: string,
  projectId: string,
  sortOrder: number,
): ProjectFileRow {
  return {
    id: `file-${projectId}-${file.path.replace(/[^a-z0-9]+/gi, "-")}`,
    workspace_id: workspaceId,
    project_id: projectId,
    path: file.path,
    label: file.label ?? null,
    sort_order: sortOrder,
  };
}

export const DEFAULT_PROJECT_FILES: ProjectFile[] = [
  { path: "src/App.tsx", label: "App" },
  { path: "src/main.tsx", label: "Entry" },
  { path: "package.json", label: "Package" },
];
