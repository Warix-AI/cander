type Listener = () => void;

const STORAGE_KEY = "courier-installed-connectors";
const installListeners = new Set<Listener>();
const EMPTY_INSTALLED: string[] = [];
let installedIds: string[] = EMPTY_INSTALLED;
let hydrated = false;
let revision = 0;

function emit() {
  installListeners.forEach((listener) => listener());
}

function parse(raw: string | null): string[] {
  if (!raw) return EMPTY_INSTALLED;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return EMPTY_INSTALLED;
    return data.filter((item): item is string => typeof item === "string");
  } catch {
    return EMPTY_INSTALLED;
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
  return EMPTY_INSTALLED;
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
  revision += 1;
  emit();
}

export function uninstallConnector(id: string) {
  hydrate();
  installedIds = installedIds.filter((item) => item !== id);
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(installedIds.length ? installedIds : []),
  );
  revision += 1;
  emit();
}

/** Replace installed catalog state (Supabase hydrate). */
export function replaceInstalledConnectorsState(next: string[]) {
  installedIds = next.length ? [...next] : EMPTY_INSTALLED;
  hydrated = true;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(installedIds));
  }
  revision += 1;
  emit();
}

export function getInstalledConnectorsRevision() {
  return revision;
}

export function mergeConnectorInstalled(
  id: string,
  seedInstalled: boolean,
): boolean {
  return seedInstalled || isConnectorInstalled(id);
}
