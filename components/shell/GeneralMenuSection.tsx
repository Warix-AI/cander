"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  ChartNoAxesColumn,
  CreditCard,
  LayoutGrid,
  Mic,
  Palette,
  Shield,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { PinSectionSearch } from "@/components/shell/PinSectionSearch";
import { useIsPlatformAdmin } from "@/lib/admin/use-platform-admin";
import { visibleSettingsTabs } from "@/lib/settings-nav";
import type { SettingsTab } from "@/lib/types";
import { closeAllPinSections, openPinSection } from "@/lib/pin-display-prefs";
import {
  SIDEBAR_ROW_HOVER,
  SIDEBAR_ROW_SECONDARY,
  SIDEBAR_ROW_SECONDARY_ICON,
} from "@/lib/mobile-menu-styles";
import { cn } from "@/lib/utils";

/** Accordion id for the General folder in the primary nav card. */
export const GENERAL_MENU_SECTION_ID = "account";

const SETTINGS_ICONS: Record<SettingsTab, LucideIcon> = {
  organization: Building2,
  workspaces: LayoutGrid,
  plans: CreditCard,
  usage: ChartNoAxesColumn,
  voice: Mic,
  notifications: Bell,
  general: UserRound,
  appearance: Palette,
};

const SETTINGS_LABEL: Partial<Record<SettingsTab, string>> = {
  plans: "Your plan",
};

type MenuRow =
  | { kind: "admin" }
  | { kind: "settings"; id: SettingsTab; label: string };

function buildGeneralMenuRows(
  entitlements: Parameters<typeof visibleSettingsTabs>[0],
  isPlatformAdmin: boolean,
): MenuRow[] {
  const tabs = visibleSettingsTabs(entitlements);
  const rows: MenuRow[] = [];

  if (isPlatformAdmin) {
    rows.push({ kind: "admin" });
    for (const tab of tabs) {
      rows.push({
        kind: "settings",
        id: tab.id,
        label: SETTINGS_LABEL[tab.id] ?? tab.label,
      });
    }
    return rows;
  }

  // Users: Usage first, then the rest in settings order (skipping Usage once).
  const usage = tabs.find((tab) => tab.id === "usage");
  if (usage) {
    rows.push({
      kind: "settings",
      id: "usage",
      label: SETTINGS_LABEL.usage ?? usage.label,
    });
  }
  for (const tab of tabs) {
    if (tab.id === "usage") continue;
    rows.push({
      kind: "settings",
      id: tab.id,
      label: SETTINGS_LABEL[tab.id] ?? tab.label,
    });
  }
  return rows;
}

/**
 * Expanded General list — settings destinations (plus Admin for platform admins).
 */
export function GeneralMenuBody({
  matchPrimaryCard = false,
  rowClassName,
  iconClassName = SIDEBAR_ROW_SECONDARY_ICON,
  onNavigate,
  query: queryProp,
  onQueryChange,
  hideSearch = false,
}: {
  matchPrimaryCard?: boolean;
  rowClassName?: string;
  iconClassName?: string;
  /** Called after a destination is chosen (e.g. close mobile menu). */
  onNavigate?: () => void;
  /** Controlled search when Search is lifted above the mode switcher. */
  query?: string;
  onQueryChange?: (next: string) => void;
  hideSearch?: boolean;
}) {
  const router = useRouter();
  const { entitlements, openSettings, settingsTab, view } = useApp();
  const isPlatformAdmin = useIsPlatformAdmin();
  const [internalQuery, setInternalQuery] = useState("");
  const query = queryProp ?? internalQuery;
  const setQuery = onQueryChange ?? setInternalQuery;

  const rows = useMemo(
    () => buildGeneralMenuRows(entitlements, isPlatformAdmin === true),
    [entitlements, isPlatformAdmin],
  );

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((row) => {
        const label = row.kind === "admin" ? "Admin" : row.label;
        return label.toLowerCase().includes(needle);
      })
    : rows;

  const openTab = (id: SettingsTab) => {
    openSettings(id);
    openPinSection(GENERAL_MENU_SECTION_ID);
    onNavigate?.();
  };

  return (
    <>
      {hideSearch ? null : (
        <PinSectionSearch
          value={query}
          onChange={setQuery}
          matchPrimaryCard={matchPrimaryCard}
          padClassName={rowClassName ? "" : undefined}
          className={rowClassName}
        />
      )}
      {filtered.map((row) => {
        if (row.kind === "admin") {
          return (
            <button
              key="admin"
              type="button"
              onClick={() => {
                closeAllPinSections();
                router.push("/admin");
                onNavigate?.();
              }}
              className={cn(
                rowClassName ?? cn(SIDEBAR_ROW_SECONDARY, SIDEBAR_ROW_HOVER),
              )}
            >
              <Shield className={iconClassName} strokeWidth={2} />
              <span className="min-w-0 flex-1 truncate">Admin</span>
            </button>
          );
        }

        const Icon = SETTINGS_ICONS[row.id];
        const active = view === "settings" && settingsTab === row.id;
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => openTab(row.id)}
            className={cn(
              rowClassName ?? cn(SIDEBAR_ROW_SECONDARY, SIDEBAR_ROW_HOVER),
              active && "shell-select-active !text-[var(--shell-select-foreground)]",
            )}
          >
            <Icon className={iconClassName} strokeWidth={2} />
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
          </button>
        );
      })}
    </>
  );
}
