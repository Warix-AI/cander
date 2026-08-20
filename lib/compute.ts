import type { HardwareCapabilities, ModelRequirements } from "./types";

/** True when hardware is unknown or meets the model's declared needs. Never consults a plan. */
export function modelFitsHardware(
  model: ModelRequirements,
  hardware?: HardwareCapabilities,
) {
  if (model.memoryGb == null || hardware?.memoryGb == null) return true;
  return hardware.memoryGb >= model.memoryGb;
}

/** Parse "7.2 GB" style strings from catalog copy. */
export function parseMemoryGb(memory: string): number | undefined {
  const match = memory.match(/^([\d.]+)\s*GB/i);
  return match ? parseFloat(match[1]) : undefined;
}

/** Demo hardware profile for local/on-device compatibility hints. */
export const demoLocalHardware: HardwareCapabilities = { memoryGb: 16 };
