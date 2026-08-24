import {
  BarChart3,
  Cpu,
  LayoutGrid,
  Server,
  type LucideIcon,
} from "lucide-react";
import type { PlatformNav } from "@/lib/types";

export type PlatformMobileTabId = "overview" | "hosting" | "build" | "more";

export type PlatformMobileTab = {
  id: PlatformMobileTabId;
  label: string;
  Icon: LucideIcon;
  /** Single destination — navigates directly. */
  nav?: PlatformNav;
  /** Grouped destinations — opens a picker sheet. */
  items?: PlatformNav[];
};

export const platformMobileTabs: PlatformMobileTab[] = [
  { id: "overview", label: "Overview", Icon: LayoutGrid, nav: "overview" },
  {
    id: "hosting",
    label: "Hosting",
    Icon: Server,
    items: ["hosting", "deployments", "logs"],
  },
  {
    id: "build",
    label: "Build",
    Icon: Cpu,
    items: ["models", "api", "keys"],
  },
  {
    id: "more",
    label: "More",
    Icon: BarChart3,
    items: ["usage", "docs", "recents"],
  },
];

export function platformTabForNav(nav: PlatformNav): PlatformMobileTabId {
  for (const tab of platformMobileTabs) {
    if (tab.nav === nav) return tab.id;
    if (tab.items?.includes(nav)) return tab.id;
  }
  return "overview";
}

export function visiblePlatformMobileTabs(
  allowed: (nav: PlatformNav) => boolean,
): PlatformMobileTab[] {
  return platformMobileTabs.filter((tab) => {
    if (tab.nav) return allowed(tab.nav);
    return tab.items!.some((id) => allowed(id));
  });
}

export function allowedItemsForPlatformTab(
  tab: PlatformMobileTab,
  allowed: (nav: PlatformNav) => boolean,
): PlatformNav[] {
  if (tab.nav) return allowed(tab.nav) ? [tab.nav] : [];
  return tab.items!.filter((id) => allowed(id));
}

export function isPlatformNavInTab(
  nav: PlatformNav,
  tab: PlatformMobileTab,
): boolean {
  if (tab.nav) return tab.nav === nav;
  return tab.items?.includes(nav) ?? false;
}
