import type { ControlMode } from "@/lib/computer/computer-provider";

type ActiveComputerSession = {
  sessionId: string;
  controlMode: ControlMode;
  streamUrl: string | null;
  currentUrl: string | null;
  /** Bumped when the panel should focus/create an agent-browser tab. */
  focusRevision: number;
};

let active: ActiveComputerSession | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getActiveComputerSession(): ActiveComputerSession | null {
  return active;
}

export function setActiveComputerSession(
  next: Omit<ActiveComputerSession, "focusRevision"> | null,
  opts?: { focus?: boolean },
) {
  if (!next) {
    active = null;
    emit();
    return;
  }
  const prev = active;
  const shouldFocus = opts?.focus !== false;
  active = {
    ...next,
    focusRevision: shouldFocus
      ? (prev?.focusRevision ?? 0) + 1
      : (prev?.focusRevision ?? 0),
  };
  emit();
}

export function setActiveComputerControlMode(mode: ControlMode) {
  if (!active) {
    return;
  }
  active = { ...active, controlMode: mode };
  emit();
}

export function updateActiveComputerUrl(url: string | null) {
  if (!active) {
    return;
  }
  active = { ...active, currentUrl: url };
  emit();
}

export function subscribeActiveComputerSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActiveComputerSessionSnapshot() {
  return active;
}
