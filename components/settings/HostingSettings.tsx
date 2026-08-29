"use client";

import { useApp } from "@/components/app/AppProvider";
import { HostingModePicker } from "@/components/settings/HostingModePicker";
import {
  SettingsFootnote,
  SettingsHeader,
  SettingsPage,
  SettingsPanel,
  SettingsSection,
} from "@/components/settings/SettingsChrome";
import type { AiRuntimeMode } from "@/lib/ai/runtime/types";

export function HostingSettings() {
  const { setHostingMode } = useApp();

  const onModeChange = (mode: AiRuntimeMode) => {
    if (mode === "cloud") setHostingMode("cloud");
    else if (mode === "local") setHostingMode("on-device");
    else setHostingMode("local");
  };

  return (
    <SettingsPage>
      <SettingsHeader
        title="Hosting"
        subtitle="Choose where AI runs — Cander cloud or on-device Apple Intelligence."
      />
      <SettingsPanel>
        <SettingsSection title="Inference">
          <HostingModePicker onModeChange={onModeChange} />
          <SettingsFootnote>
            On device requires the Cander iOS app on hardware that supports Apple
            Intelligence. Web and unsupported devices stay on Cloud. LOCAL never
            silently falls back to cloud. Change this anytime in Settings →
            Hosting.
          </SettingsFootnote>
        </SettingsSection>
      </SettingsPanel>
    </SettingsPage>
  );
}
