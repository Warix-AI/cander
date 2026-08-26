/** Stub for Phase 6 localStorage → server migration. */
export type MigrationScan = {
  projects: number;
  sources: number;
  threads: number;
  attachments: number;
};

export function scanLocalMigration(): MigrationScan {
  if (typeof window === "undefined") {
    return { projects: 0, sources: 0, threads: 0, attachments: 0 };
  }
  const entities = window.localStorage.getItem("courier-space-entities-v1");
  let projects = 0;
  let sources = 0;
  if (entities) {
    try {
      const parsed = JSON.parse(entities) as {
        projects?: unknown[];
        sources?: unknown[];
      };
      projects = parsed.projects?.length ?? 0;
      sources = parsed.sources?.length ?? 0;
    } catch {
      // ignore corrupt payload
    }
  }
  return {
    projects,
    sources,
    threads: 0,
    attachments: 0,
  };
}

export async function migrateToRemote(_workspaceId: string): Promise<void> {
  throw new Error("Remote migration is not enabled yet (Phase 6).");
}
