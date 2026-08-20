type Listener = () => void;

const STORAGE_KEY = "courier-installed-connectors";
const installListeners = new Set<Listener>();
let installedIds: string[] = [];
let hydrated = false;

function emit() {
  installListeners.forEach((listener) => listener());
}

function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  installedIds = parse(window.localStorage.getItem(STORAGE_KEY));
}

export function subscribeInstalledConnectors(listener: Listener) {
  hydrate();
  installListeners.add(listener);
  return () => {
    installListeners.delete(listener);
  };
}

export function getInstalledConnectorsSnapshot() {
  return installedIds;
}

export function getInstalledConnectorsServerSnapshot() {
  return [] as string[];
}

export function isConnectorInstalled(id: string) {
  hydrate();
  return installedIds.includes(id);
}

export function installConnector(id: string) {
  hydrate();
  if (installedIds.includes(id)) return;
  installedIds = [id, ...installedIds];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(installedIds));
  emit();
}

export function uninstallConnector(id: string) {
  hydrate();
  installedIds = installedIds.filter((item) => item !== id);
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(installedIds.length ? installedIds : []),
  );
  emit();
}

export function mergeConnectorInstalled(
  id: string,
  seedInstalled: boolean,
): boolean {
  return seedInstalled || isConnectorInstalled(id);
}
