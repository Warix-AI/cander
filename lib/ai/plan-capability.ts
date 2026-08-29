/**
 * Short plan capability line for assistant prompts (on-device + Edge profile).
 */

import { entitlementsFor } from "@/lib/entitlements";
import type { Member } from "@/lib/types";

export function buildPlanCapabilityLine(actor: Member | null | undefined): string {
  if (!actor) return "";
  const e = entitlementsFor(actor);
  const bits = [
    `User plan: ${e.plan}.`,
    e.hasVoice ? "Voice is available." : "Voice is not included on this plan.",
    e.workspaceCap === Infinity
      ? "Workspaces are unlimited."
      : `Workspace limit: ${e.workspaceCap}.`,
    e.hasKnowledgeBases
      ? "Knowledge bases are available."
      : "Knowledge bases are not on this plan.",
    e.showOrgAdmin || e.showOrgManaged
      ? "Organization features may apply."
      : null,
    "Respect plan limits; do not promise features they lack.",
    "Always confirm with the user before deleting projects or other data.",
  ].filter(Boolean);
  return bits.join(" ");
}
