/**
 * One-shot flags for mobile nav so project push/pop matches chat↔panel timing.
 */

export type MobileSurfaceEnter = "forward" | "back";

let skipPagerTransitionOnce = false;
let surfaceEnter: MobileSurfaceEnter | null = null;
let panelStackDirection: MobileSurfaceEnter = "forward";

/** Jump the chat|panel pager without its strip animation (paired with a surface enter). */
export function skipMobilePagerTransitionOnce() {
  skipPagerTransitionOnce = true;
}

export function consumeSkipMobilePagerTransition() {
  if (!skipPagerTransitionOnce) return false;
  skipPagerTransitionOnce = false;
  return true;
}

/**
 * Skip the pager strip and play a full-screen push/pop on the destination surface
 * (same 500ms curve as chat ↔ Build/Explore).
 */
export function requestMobileSurfaceEnter(direction: MobileSurfaceEnter) {
  panelStackDirection = direction;
  surfaceEnter = direction;
  skipPagerTransitionOnce = true;
}

export function consumeMobileSurfaceEnter(): MobileSurfaceEnter | null {
  const next = surfaceEnter;
  surfaceEnter = null;
  return next;
}

export function setMobilePanelStackDirection(next: MobileSurfaceEnter) {
  panelStackDirection = next;
}

export function getMobilePanelStackDirection(): MobileSurfaceEnter {
  return panelStackDirection;
}
