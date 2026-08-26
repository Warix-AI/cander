import type { Entitlements } from "./entitlements";
import type { SettingsTab } from "./types";

export const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "organization", label: "Organization" },
  { id: "workspaces", label: "Workspaces" },
  { id: "plans", label: "Plans" },
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
];

export function visibleSettingsTabs(entitlements: Entitlements) {
  return SETTINGS_TABS.filter((tab) => {
    if (tab.id === "organization") return entitlements.showOrgSettings;
    if (tab.id === "workspaces") return entitlements.showWorkspacesAdmin;
    return true;
  });
}
