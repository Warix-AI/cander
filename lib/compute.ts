import type { HardwareCapabilities, ModelRequirements } from "./types";

/** True when hardware is unknown or meets the model's declared needs. Never consults a plan. */
export function modelFitsHardware(
  model: ModelRequirements,
  hardware?: HardwareCapabilities,
) {
  if (model.memoryGb == null || hardware?.memoryGb == null) return true;
  return hardware.memoryGb >= model.memoryGb;
}
