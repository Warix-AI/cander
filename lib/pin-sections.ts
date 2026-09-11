import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Blocks,
  Bot,
  Image as ImageIcon,
  Layout,
  MessageSquare,
  Search,
} from "lucide-react";
import type { ProjectKind } from "@/lib/space-entities";
import type { PinKind, SpaceId } from "@/lib/types";

/** Sidebar expandable pin folders — look like New / Canvas rows. */
export type PinSectionId =
  | "connectors"
  | "agents"
  | "websites"
  | "apps"
  | "images"
  | "searches"
  | "chats";

/** Agents section sits directly under Connectors. */
export const PIN_SECTION_ORDER: PinSectionId[] = [
  "connectors",
  "agents",
  "websites",
  "apps",
  "images",
  "searches",
  "chats",
];

export const PIN_SECTION_LABEL: Record<PinSectionId, string> = {
  connectors: "Connectors",
  agents: "Agents",
  websites: "Websites",
  apps: "Apps",
  images: "Images",
  searches: "Searches",
  chats: "Chats",
};

/** Each folder uses a distinct glyph (Canvas keeps Brush separately). */
export const PIN_SECTION_ICONS: Record<PinSectionId, LucideIcon> = {
  connectors: Blocks,
  agents: Bot,
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
