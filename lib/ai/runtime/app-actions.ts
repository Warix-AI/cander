/**
 * Bridge from AI tools → AppProvider actions.
 * AppProvider registers handlers on mount; tools never import React.
 */

export type NavOpenTarget =
  | { kind: "space"; space: string }
  | { kind: "settings"; tab?: string }
  | { kind: "recents" }
  | { kind: "connectors" }
  | { kind: "new_chat" };

export type AppActionHandlers = {
  navOpen: (target: NavOpenTarget) => { ok: boolean; detail: string };
  panelOpen: (opts: {
    projectId?: string;
    mode?: string;
  }) => { ok: boolean; detail: string };
  panelClose: () => { ok: boolean; detail: string };
  projectCreate: (opts: {
    title: string;
    space?: string;
    kind?: string;
    summary?: string;
  }) => Promise<{ ok: boolean; detail: string; projectId?: string }>;
  projectOpen: (projectId: string) => { ok: boolean; detail: string };
  workspaceSearch: (query: string) => {
    ok: boolean;
    detail: string;
    results: Array<{ id: string; title: string; space?: string }>;
  };
  knowledgeSearch: (query: string) => {
    ok: boolean;
    detail: string;
    results: Array<{
      knowledgeBaseName: string;
      fileName: string;
      excerpt: string;
    }>;
  };
  askClarification: (opts: {
    title: string;
    description?: string;
    questions: unknown[];
    /** Prefer the turn's thread id — React state can lag after newChat. */
    threadId?: string;
    resumeTool?: string;
    resumeArguments?: Record<string, unknown>;
  }) => { ok: boolean; detail: string };
  requestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
  }) => { ok: boolean; detail: string; confirmed?: boolean };
};

let handlers: AppActionHandlers | null = null;

export function registerAppActionHandlers(next: AppActionHandlers | null) {
  handlers = next;
}

export function getAppActionHandlers(): AppActionHandlers | null {
  return handlers;
}
