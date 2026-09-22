"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app/AppProvider";
import { PinSectionSearch } from "@/components/shell/PinSectionSearch";
import { useIsPlatformAdmin } from "@/lib/admin/use-platform-admin";
import { visibleSettingsTabs } from "@/lib/settings-nav";
import type { SettingsTab } from "@/lib/types";
import { closeAllPinSections, openPinSection } from "@/lib/pin-display-prefs";
import {
  SIDEBAR_ROW_HOVER,
  SIDEBAR_ROW_SECONDARY,
} from "@/lib/mobile-menu-styles";
import { cn } from "@/lib/utils";

/** Accordion id for the General folder in the primary nav card. */
export const GENERAL_MENU_SECTION_ID = "account";

const SETTINGS_LABEL: Partial<Record<SettingsTab, string>> = {
  plans: "Your plan",
};

type MenuRow =
  | { kind: "admin" }
  | { kind: "help" }
  | { kind: "settings"; id: SettingsTab; label: string };

function buildGeneralMenuRows(
  entitlements: Parameters<typeof visibleSettingsTabs>[0],
  isPlatformAdmin: boolean,
): MenuRow[] {
  const tabs = visibleSettingsTabs(entitlements);
  const rows: MenuRow[] = [];

  // Usage always leads the General list (top-aligned like other sections).
  const usage = tabs.find((tab) => tab.id === "usage");
  if (usage) {
    rows.push({
      kind: "settings",
      id: "usage",
      label: SETTINGS_LABEL.usage ?? usage.label,
    });
  }

  if (isPlatformAdmin) {
    rows.push({ kind: "admin" });
  }

  for (const tab of tabs) {
    if (tab.id === "usage") continue;
    rows.push({
      kind: "settings",
      id: tab.id,
      label: SETTINGS_LABEL[tab.id] ?? tab.label,
    });
  }
  rows.push({ kind: "help" });
  return rows;
}

/**
 * Expanded General list — settings destinations (plus Admin for platform admins).
 * Text-only rows (no leading icons) to match a clean submenu.
 */
export function GeneralMenuBody({
  matchPrimaryCard = false,
  rowClassName,
  onNavigate,
  query: queryProp,
  onQueryChange,
  hideSearch = false,
}: {
  matchPrimaryCard?: boolean;
  rowClassName?: string;
  /** @deprecated Icons removed from General submenu rows. */
  iconClassName?: string;
  /** Called after a destination is chosen (e.g. close mobile menu). */
  onNavigate?: () => void;
  /** Controlled search when Search is lifted above the mode switcher. */
  query?: string;
  onQueryChange?: (next: string) => void;
  hideSearch?: boolean;
}) {
  const router = useRouter();
  const { entitlements, openSettings, openHelp, settingsTab, view } = useApp();
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
        const label =
          row.kind === "admin" ? "Admin" : row.kind === "help" ? "Help" : row.label;
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
              <span className="min-w-0 flex-1 truncate">Admin</span>
            </button>
          );
        }

        if (row.kind === "help") {
          return (
            <button
              key="help"
              type="button"
              onClick={() => {
                openHelp();
                onNavigate?.();
              }}
              className={cn(
                rowClassName ?? cn(SIDEBAR_ROW_SECONDARY, SIDEBAR_ROW_HOVER),
                view === "help" && "shell-nav-row-active",
              )}
            >
              <span className="min-w-0 flex-1 truncate">Help</span>
            </button>
          );
        }

        const active = view === "settings" && settingsTab === row.id;
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => openTab(row.id)}
            className={cn(
              rowClassName ?? cn(SIDEBAR_ROW_SECONDARY, SIDEBAR_ROW_HOVER),
              active && "shell-nav-row-active",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
          </button>
        );
      })}
    </>
  );
}
