/** One-shot composer seed — filled into the input then cleared. */
let seed: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function setComposerSeed(text: string) {
  seed = text;
  emit();
}

export function peekComposerSeed() {
  return seed;
}

export function consumeComposerSeed() {
  const next = seed;
  seed = null;
  if (next !== null) emit();
  return next;
}

export function subscribeComposerSeed(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
