"use client";

import { AppearanceControls } from "@/components/settings/AppearanceControls";
import {
  SettingsHeader,
  SettingsPage,
} from "@/components/settings/SettingsChrome";

export function AppearanceSettings() {
  return (
    <SettingsPage>
      <SettingsHeader title="Appearance" />

      <div className="mt-2 lg:mt-10">
        <AppearanceControls />
      </div>
    </SettingsPage>
  );
}
