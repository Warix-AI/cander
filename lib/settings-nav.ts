import type { Entitlements } from "./entitlements";
import type { SettingsTab } from "./types";

export const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "workspaces", label: "Spaces" },
  { id: "plans", label: "Plans" },
  { id: "usage", label: "Usage" },
  { id: "notifications", label: "Notifications" },
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
];

export function visibleSettingsTabs(entitlements: Entitlements) {
  return SETTINGS_TABS.filter((tab) => {
    if (tab.id === "workspaces") return entitlements.hasWorkspaces;
    return true;
  });
}
