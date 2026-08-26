"use client";

import { AppearanceControls } from "@/components/settings/AppearanceControls";
import { DashBtn } from "@/components/spaces/ItemSet";
import { resetAppearance } from "@/lib/appearance";
import {
  SettingsHeader,
  SettingsPage,
} from "@/components/settings/SettingsChrome";

export function AppearanceSettings() {
  return (
    <SettingsPage>
      <SettingsHeader
        title="Appearance"
        subtitle="Choose a color mode and shell layout. Changes apply immediately."
        actions={
          <DashBtn onClick={() => resetAppearance()}>Reset defaults</DashBtn>
        }
      />

      <div className="mt-10">
        <AppearanceControls />
      </div>
    </SettingsPage>
  );
}
