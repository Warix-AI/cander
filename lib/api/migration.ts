/** Local → Supabase migration helpers (Phase 1). */
export type MigrationScan = {
  projects: number;
  sources: number;
  threads: number;
  attachments: number;
};

const ENTITY_STORAGE_KEY = "courier-space-entities-v1";
const THREAD_STORAGE_KEY = "courier-threads-v1";

export function scanLocalMigration(): MigrationScan {
  if (typeof window === "undefined") {
    return { projects: 0, sources: 0, threads: 0, attachments: 0 };
  }
  const entities = window.localStorage.getItem(ENTITY_STORAGE_KEY);
  let projects = 0;
  let sources = 0;
  let attachments = 0;
  if (entities) {
    try {
      const parsed = JSON.parse(entities) as {
        projects?: unknown[];
        sources?: unknown[];
        attachments?: unknown[];
      };
      projects = parsed.projects?.length ?? 0;
      sources = parsed.sources?.length ?? 0;
      attachments = parsed.attachments?.length ?? 0;
    } catch {
      // ignore corrupt payload
    }
  }
  let threads = 0;
  const threadRaw = window.localStorage.getItem(THREAD_STORAGE_KEY);
  if (threadRaw) {
    try {
      const parsed = JSON.parse(threadRaw) as unknown[];
      threads = Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      // ignore
    }
  }
  return { projects, sources, threads, attachments };
}

/** Import runs automatically via entity-sync on first Supabase session. */
export async function migrateToRemote(_workspaceId: string): Promise<void> {
  return;
}
