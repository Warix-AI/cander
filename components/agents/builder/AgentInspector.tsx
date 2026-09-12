"use client";

/**
 * Legacy Access/Skills inspector — Connections were removed from Agents.
 * Kept as a thin stub so dormant imports do not break the build.
 */

export function AgentInspector(_props: {
  tab?: string;
  onTabChange?: (tab: string) => void;
  agent?: unknown;
  skills?: unknown;
  knowledge?: unknown;
  knowledgeBases?: unknown;
  connections?: unknown;
  connectorEnabled?: unknown;
  toolMap?: unknown;
  busy?: boolean;
  hideTabs?: boolean;
  onSaveIdentity?: (patch: unknown) => void;
  onPatch?: (patch: unknown) => void;
}) {
  return (
    <div className="px-3 py-4 text-[12.5px] text-muted-foreground">
      Agents no longer manage Connections or tool grants. Put behavior in
      Instructions; Cander uses the workspace connectors at runtime.
    </div>
  );
}
