/**
 * One-shot flags for mobile nav so "back" from a project doesn't use
 * the forward chat→panel pager swipe.
 */

let skipPagerTransitionOnce = false;
let panelStackDirection: "forward" | "back" = "forward";

export function skipMobilePagerTransitionOnce() {
  skipPagerTransitionOnce = true;
}

export function consumeSkipMobilePagerTransition() {
  if (!skipPagerTransitionOnce) return false;
  skipPagerTransitionOnce = false;
  return true;
}

export function setMobilePanelStackDirection(next: "forward" | "back") {
  panelStackDirection = next;
}

export function getMobilePanelStackDirection(): "forward" | "back" {
  return panelStackDirection;
}
