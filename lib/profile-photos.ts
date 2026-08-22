type Listener = () => void;

const STORAGE_KEY = "courier-profile-photos";
const EMPTY_PHOTOS: Record<string, string> = {};
const listeners = new Set<Listener>();
let photos: Record<string, string> = EMPTY_PHOTOS;
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function parse(raw: string | null): Record<string, string> {
  if (!raw) return EMPTY_PHOTOS;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return EMPTY_PHOTOS;
    const next: Record<string, string> = {};
    for (const [id, value] of Object.entries(data as Record<string, unknown>)) {
      if (typeof value === "string" && value.startsWith("data:image/")) {
        next[id] = value;
      }
    }
    return Object.keys(next).length ? next : EMPTY_PHOTOS;
  } catch {
    return EMPTY_PHOTOS;
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  photos = parse(window.localStorage.getItem(STORAGE_KEY));
}

export function subscribeProfilePhotos(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getProfilePhotosSnapshot() {
  hydrate();
  return photos;
}

export function getProfilePhotosServerSnapshot(): Record<string, string> {
  return EMPTY_PHOTOS;
}

export function profilePhotoFor(
  memberId: string,
  map: Record<string, string> = photos,
) {
  return map[memberId] ?? null;
}

export function setProfilePhoto(memberId: string, dataUrl: string) {
  hydrate();
  photos = { ...photos, [memberId]: dataUrl };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
  emit();
}

export function clearProfilePhoto(memberId: string) {
  hydrate();
  const next = { ...photos };
  delete next[memberId];
  photos = Object.keys(next).length ? next : EMPTY_PHOTOS;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
  emit();
}

export function readProfilePhotoFile(file: File): Promise<string> {
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
      if (result.length > 800_000) {
        reject(new Error("Image is too large. Try a smaller file."));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}
