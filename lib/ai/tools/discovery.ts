/**
 * Layered tool discovery — families first, then schemas.
 * Does NOT rebuild keyword/regex connector routing.
 */

import {
  getCanderTool,
  listCanderToolsForFamily,
} from "./cander-registry.ts";
import type {
  CapabilityFamily,
  CapabilitySnapshot,
  CanderTool,
} from "./types.ts";
import {
  collectReferencesFromEvents,
  type PersistedToolEvent,
} from "../state/tool-events.ts";
import {
  resolveOrdinalReference,
  suggestToolsForReference,
} from "../state/references.ts";

export function maxDiscoveredTools(): number {
  const raw = Number(process.env.MAX_DISCOVERED_TOOLS ?? 15);
  return Number.isFinite(raw) ? Math.min(50, Math.max(1, raw)) : 15;
}

const FAMILY_HINTS: Array<{ family: CapabilityFamily; patterns: RegExp[] }> = [
  {
    family: "email",
    patterns: [/\b(email|e-?mail|gmail|inbox|mailbox|send mail)\b/i],
  },
  {
    family: "messaging",
    patterns: [/\b(slack|teams|dm|channel message|chat message)\b/i],
  },
  {
    family: "calendar",
    patterns: [/\b(calendar|schedule|meeting|event|invite)\b/i],
  },
  {
    family: "CRM",
    patterns: [/\b(hubspot|crm|deal|contact|pipeline)\b/i],
  },
  {
    family: "files",
    patterns: [/\b(drive|dropbox|notion page|file|document)\b/i],
  },
  {
    family: "project_management",
    patterns: [/\b(github|jira|linear|pull request|issue)\b/i],
  },
  {
    family: "commerce",
    patterns: [/\b(stripe|invoice|payment|order)\b/i],
  },
];

export type DiscoveryInput = {
  userMessage: string;
  snapshot: CapabilitySnapshot;
  recentEvents?: PersistedToolEvent[];
  alreadyExposed?: string[];
  maxTools?: number;
  /** When set (Plus menu scope), only expose these connectors' enabled tools. */
  preferConnectorIds?: string[] | null;
};

export type DiscoveryResult = {
  toolIds: string[];
  families: CapabilityFamily[];
  reason: string;
};

function connectedFamilies(snapshot: CapabilitySnapshot): Set<CapabilityFamily> {
  const out = new Set<CapabilityFamily>();
  for (const connector of snapshot.connectors) {
    out.add(connector.capabilityFamily);
  }
  return out;
}

function enabledToolIdsForFamily(
  snapshot: CapabilitySnapshot,
  family: CapabilityFamily,
): string[] {
  const tools = listCanderToolsForFamily(family);
  const enabled = new Set<string>();
  for (const connector of snapshot.connectors) {
    if (connector.capabilityFamily !== family) continue;
    for (const account of connector.accounts) {
      for (const tool of tools) {
        if (tool.connectorId !== connector.connectorId) continue;
        const key = tool.id.slice(tool.id.indexOf(".") + 1);
        if (account.capabilities[key]) {
          enabled.add(tool.id);
        }
      }
    }
  }
  return [...enabled];
}

/**
 * Layer 1: deterministic from prior structured references.
 * Layer 2: prior tool events' families.
 * Layer 3: lightweight family hints from message (not connector regex routers).
 * Layer 4: if still empty, all connected families (capped) so phrasing misses
 *          do not leave the model with zero tools.
 * Layer 5: load schemas for selected families only.
 */
export function discoverRelevantTools(input: DiscoveryInput): DiscoveryResult {
  const max = input.maxTools ?? maxDiscoveredTools();
  const already = new Set(input.alreadyExposed ?? []);
  const connected = connectedFamilies(input.snapshot);
  const selectedFamilies = new Set<CapabilityFamily>();
  const ranked: string[] = [];
  const reasons: string[] = [];

  const preferConnectorIds = (input.preferConnectorIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean);
  if (preferConnectorIds.length) {
    const preferSet = new Set(preferConnectorIds);
    for (const connector of input.snapshot.connectors) {
      if (!preferSet.has(connector.connectorId)) continue;
      selectedFamilies.add(connector.capabilityFamily);
      reasons.push(`scoped:${connector.connectorId}`);
      const ids = enabledToolIdsForFamily(
        input.snapshot,
        connector.capabilityFamily,
      ).filter((id) => preferSet.has(getCanderTool(id)?.connectorId ?? ""));
      for (const id of ids) {
        if (!already.has(id) && !ranked.includes(id)) ranked.push(id);
      }
    }
    if (ranked.length) {
      ranked.sort((a, b) => {
        const ta = getCanderTool(a);
        const tb = getCanderTool(b);
        const ra = ta?.risk === "read" ? 0 : 1;
        const rb = tb?.risk === "read" ? 0 : 1;
        return ra - rb;
      });
      return {
        toolIds: ranked.slice(0, max),
        families: [...selectedFamilies],
        reason: reasons.join("|"),
      };
    }
  }

  const events = input.recentEvents ?? [];
  const refs = collectReferencesFromEvents(events);

  if (refs.length) {
    const resolution = resolveOrdinalReference(refs, input.userMessage);
    if (resolution.ok) {
      for (const toolId of suggestToolsForReference(resolution.reference)) {
        if (!already.has(toolId) && getCanderTool(toolId)) {
          ranked.push(toolId);
        }
      }
      reasons.push(`reference:${resolution.reference.type}`);
    }
  }

  for (const event of events.slice(0, 8)) {
    const tool = getCanderTool(event.toolId);
    if (tool && connected.has(tool.capabilityFamily)) {
      selectedFamilies.add(tool.capabilityFamily);
    }
  }
  if (selectedFamilies.size) reasons.push("prior_events");

  for (const hint of FAMILY_HINTS) {
    if (!connected.has(hint.family)) continue;
    if (hint.patterns.some((re) => re.test(input.userMessage))) {
      selectedFamilies.add(hint.family);
    }
  }

  if (!selectedFamilies.size && connected.size === 1) {
    selectedFamilies.add([...connected][0]!);
    reasons.push("single_family_sticky");
  }

  if (
    !selectedFamilies.size &&
    connected.has("email") &&
    refs.some((r) => r.type.startsWith("email_"))
  ) {
    selectedFamilies.add("email");
    reasons.push("email_reference_sticky");
  }

  if (!selectedFamilies.size && connected.size) {
    // Prefer lean turns: only dump all families when the message looks
    // actionable (or tools were already scoped). Plain chat stays tool-free.
    const actionable =
      /\b(check|search|find|look|read|send|email|inbox|slack|message|schedule|meeting|deal|invoice|file|pull request|issue)\b/i.test(
        input.userMessage,
      );
    if (actionable) {
      for (const family of connected) {
        selectedFamilies.add(family);
      }
      reasons.push("all_connected_families");
    } else {
      return {
        toolIds: [],
        families: [],
        reason: "capability_index_only",
      };
    }
  }

  if (!selectedFamilies.size) {
    return {
      toolIds: [],
      families: [],
      reason: "no_connected_families",
    };
  }

  reasons.push(`families:${[...selectedFamilies].join(",")}`);

  for (const family of selectedFamilies) {
    const ids = enabledToolIdsForFamily(input.snapshot, family);
    for (const id of ids) {
      if (already.has(id) || ranked.includes(id)) continue;
      ranked.push(id);
    }
  }

  ranked.sort((a, b) => {
    const ta = getCanderTool(a);
    const tb = getCanderTool(b);
    const ra = ta?.risk === "read" ? 0 : 1;
    const rb = tb?.risk === "read" ? 0 : 1;
    return ra - rb;
  });

  return {
    toolIds: ranked.slice(0, max),
    families: [...selectedFamilies],
    reason: reasons.join("|"),
  };
}

export function resolveToolsForExposure(toolIds: string[]): CanderTool[] {
  const out: CanderTool[] = [];
  for (const id of toolIds) {
    const tool = getCanderTool(id);
    if (tool) out.push(tool);
  }
  return out;
}
