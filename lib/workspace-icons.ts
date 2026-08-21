type Listener = () => void;

const STORAGE_KEY = "courier-workspace-icons";
const EMPTY_ICONS: Record<string, string> = {};
const listeners = new Set<Listener>();
let icons: Record<string, string> = EMPTY_ICONS;
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function parse(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return {};
    const next: Record<string, string> = {};
    for (const [id, value] of Object.entries(data as Record<string, unknown>)) {
      if (typeof value === "string" && value.startsWith("data:image/")) {
        next[id] = value;
      }
    }
    return next;
  } catch {
    return {};
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  icons = parse(window.localStorage.getItem(STORAGE_KEY));
}

export function subscribeWorkspaceIcons(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWorkspaceIconsSnapshot() {
  hydrate();
  return icons;
}

export function getWorkspaceIconsServerSnapshot(): Record<string, string> {
  return EMPTY_ICONS;
}

export function workspaceIconFor(
  id: string,
  map: Record<string, string> = icons,
) {
  return map[id] ?? null;
}

export function setWorkspaceIcon(id: string, dataUrl: string) {
  hydrate();
  icons = { ...icons, [id]: dataUrl };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
  emit();
}

export function clearWorkspaceIcon(id: string) {
  hydrate();
  const next = { ...icons };
  delete next[id];
  icons = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
  emit();
}

/** Read an image file into a compressed data URL for localStorage. */
export function readWorkspaceIconFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose an image file."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read that image."));
        return;
      }
      // Soft cap ~600KB so localStorage stays healthy.
      if (result.length > 800_000) {
        reject(new Error("Image is too large. Try a smaller file."));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}
