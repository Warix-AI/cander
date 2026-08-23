"use client";

import { AppearanceSliders } from "@/components/settings/AppearanceSliders";
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
        subtitle="Personalize color, type, spacing, shapes, motion, and shell layout. Changes apply immediately."
        actions={
          <DashBtn onClick={() => resetAppearance()}>Reset defaults</DashBtn>
        }
      />

      <div className="mt-10">
        <AppearanceSliders />
      </div>
    </SettingsPage>
  );
}
