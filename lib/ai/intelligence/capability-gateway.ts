/**
 * Capability gateway — model never self-grants permission.
 * Local nav stays client-authorized; cloud side-effects need capability checks.
 */

import { getAiTool } from "@/lib/ai/tools/registry";
import { isCloudWorkEnabled, isSandboxEnabled } from "./flags.ts";
import {
  assertTrustedPolicyAction,
  type CapabilityCheckResult,
} from "./policy.ts";

export type { CapabilityCheckResult };
export { assertTrustedPolicyAction };

export function authorizeToolCapability(toolName: string): CapabilityCheckResult {
  const tool = getAiTool(toolName);
  if (!tool || !tool.enabled) {
    return { ok: false, reason: "Unknown or disabled tool." };
  }
  const cap = tool.permission.capability;
  if (cap === "cloud_work" || cap === "release") {
    if (!isCloudWorkEnabled()) {
      return { ok: false, reason: "Cloud work is not enabled." };
    }
  }
  if (toolName === "create_work_task" && !isCloudWorkEnabled()) {
    return { ok: false, reason: "Cloud work is not enabled." };
  }
  if (cap === "sandbox" && !isSandboxEnabled()) {
    return { ok: false, reason: "Sandbox execution is not enabled." };
  }
  return { ok: true };
}
