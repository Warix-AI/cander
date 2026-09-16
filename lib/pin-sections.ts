import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Blocks,
  Brain,
  Image as ImageIcon,
  Layout,
  MessageSquare,
  Search,
} from "lucide-react";
import type { ProjectKind } from "@/lib/space-entities";
import type { PinKind, SpaceId } from "@/lib/types";

/** Sidebar expandable pin folders — look like New / Apps / Chats rows. */
export type PinSectionId =
  | "connectors"
  | "agents"
  | "websites"
  | "apps"
  | "images"
  | "searches"
  | "chats";

/**
 * Pin folder order. Apps → Experts → Chats sit in the primary New card;
 * remaining folders render below.
 */
export const PIN_SECTION_ORDER: PinSectionId[] = [
  "connectors",
  "agents",
  "chats",
  "websites",
  "apps",
  "images",
  "searches",
];

/** Sections that live inside the New / Apps / Experts / Chats inset card. */
export const PRIMARY_PIN_SECTION_IDS: PinSectionId[] = [
  "connectors",
  "agents",
  "chats",
];

/** Agents section id kept for pin folder keys; label is Experts. */
export const PIN_SECTION_LABEL: Record<PinSectionId, string> = {
  connectors: "Apps",
  agents: "Experts",
  websites: "Websites",
  apps: "Apps",
  images: "Images",
  searches: "Searches",
  chats: "Chats",
};

/** Each folder uses a distinct glyph. */
export const PIN_SECTION_ICONS: Record<PinSectionId, LucideIcon> = {
  connectors: Blocks,
  agents: Brain,
  websites: Layout,
  apps: AppWindow,
  images: ImageIcon,
  searches: Search,
  chats: MessageSquare,
};

export type PinSectionItem = {
  kind: PinKind;
  id: string;
  title: string;
  icon?: string;
  spaceId?: SpaceId;
  projectKind?: ProjectKind;
};

export function pinSectionForItem(item: PinSectionItem): PinSectionId {
  if (item.kind === "connector") return "connectors";
  if (item.kind === "thread") return "chats";
  switch (item.projectKind) {
    case "automation":
      return "agents";
    case "site":
      return "websites";
    case "app":
      return "apps";
    case "general":
      return "images";
    case "research":
      return "searches";
    default:
      // Unknown / unresolved project pins — keep under Apps.
      return "apps";
  }
}

/** Group pins into expandable sidebar folders; omit empty sections. */
export function groupPinnedItemsBySection<T extends PinSectionItem>(
  items: T[],
  opts?: { visibleKinds?: PinKind[] },
): { id: PinSectionId; items: T[] }[] {
  const visible = opts?.visibleKinds
    ? new Set(opts.visibleKinds)
    : null;
  const filtered = visible
    ? items.filter((item) => visible.has(item.kind))
    : items;

  const buckets = new Map<PinSectionId, T[]>();
  for (const id of PIN_SECTION_ORDER) buckets.set(id, []);

  for (const item of filtered) {
    const section = pinSectionForItem(item);
    buckets.get(section)!.push(item);
  }

  const out: { id: PinSectionId; items: T[] }[] = [];
  for (const id of PIN_SECTION_ORDER) {
    const sectionItems = buckets.get(id) ?? [];
    if (sectionItems.length) out.push({ id, items: sectionItems });
  }
  return out;
}

/**
 * Ensure the Apps (connectors) pin folder exists so More discovery can render
 * even when the user has no connected/pinned apps yet.
 */
export function ensureAppsPinSection<T extends PinSectionItem>(
  groups: { id: PinSectionId; items: T[] }[],
): { id: PinSectionId; items: T[] }[] {
  return ensurePinSection(groups, "connectors");
}

/** Ensure the Chats pin folder exists even with no pinned threads yet. */
export function ensureChatsPinSection<T extends PinSectionItem>(
  groups: { id: PinSectionId; items: T[] }[],
): { id: PinSectionId; items: T[] }[] {
  return ensurePinSection(groups, "chats");
}

/** Primary sidebar card folders — Apps, Experts, and Chats always available. */
export function ensurePrimaryPinSections<T extends PinSectionItem>(
  groups: { id: PinSectionId; items: T[] }[],
): { id: PinSectionId; items: T[] }[] {
  let next = groups;
  for (const id of PRIMARY_PIN_SECTION_IDS) {
    next = ensurePinSection(next, id);
  }
  return next;
}

function ensurePinSection<T extends PinSectionItem>(
  groups: { id: PinSectionId; items: T[] }[],
  id: PinSectionId,
): { id: PinSectionId; items: T[] }[] {
  if (groups.some((group) => group.id === id)) return groups;
  const empty = { id, items: [] as T[] };
  const orderIndex = new Map(
    PIN_SECTION_ORDER.map((sectionId, index) => [sectionId, index] as const),
  );
  const next = [...groups, empty];
  next.sort(
    (a, b) => (orderIndex.get(a.id) ?? 99) - (orderIndex.get(b.id) ?? 99),
  );
  return next;
}
