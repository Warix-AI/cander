type Listener = () => void;

const listeners = new Set<Listener>();
let selectedModel = "Auto";
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const stored = window.localStorage.getItem("courier-build-model");
  if (stored) selectedModel = stored;
}

export function subscribeBuildRuntime(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBuildRuntimeSnapshot() {
  return selectedModel;
}

export function getBuildRuntimeServerSnapshot() {
  return "Auto";
}

export function setBuildModel(name: string) {
  hydrate();
  selectedModel = name;
  window.localStorage.setItem("courier-build-model", name);
  emit();
}
