"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  SettingsFootnote,
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/SettingsChrome";
import {
  getAiRuntimeMode,
  setAiRuntimeMode,
  subscribeAiRuntimeMode,
} from "@/lib/ai/runtime/mode-store";
import {
  getFoundationModelsAvailability,
  resetFoundationModelsPluginCache,
} from "@/lib/ai/runtime/native/foundation-models";
import type { AiRuntimeMode } from "@/lib/ai/runtime/types";
import { persistHosting } from "@/lib/session";
import { cn } from "@/lib/utils";

const MODES: {
  id: AiRuntimeMode;
  title: string;
  body: string;
}[] = [
  {
    id: "cloud",
    title: "Cloud",
    body: "Cander cloud inference (private chat via our servers). Works on web and every device.",
  },
  {
    id: "auto",
    title: "Auto",
    body: "Prefer on-device Apple Intelligence when available; otherwise use Cloud.",
  },
  {
    id: "local",
    title: "On device",
    body: "Force Apple on-device AI. Never silently sends prompts to the cloud for inference.",
  },
];

function syncHosting(mode: AiRuntimeMode) {
  if (mode === "cloud") persistHosting("cloud");
  else if (mode === "local") persistHosting("on-device");
  else persistHosting("local");
}

export function HostingSettings() {
  const { setHostingMode } = useApp();
  const [mode, setMode] = useState<AiRuntimeMode>("auto");
  const [status, setStatus] = useState({
    available: false,
    message: "Checking…",
    reason: "",
  });

  useEffect(() => {
    setMode(getAiRuntimeMode());
    return subscribeAiRuntimeMode(() => setMode(getAiRuntimeMode()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      resetFoundationModelsPluginCache();
      void getFoundationModelsAvailability().then((avail) => {
        if (cancelled) return;
        setStatus({
          available: avail.available,
          message: avail.message,
          reason: avail.reason,
        });
      });
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [mode]);

  const select = (next: AiRuntimeMode) => {
    setAiRuntimeMode(next);
    setMode(next);
    syncHosting(next);
    if (next === "cloud") setHostingMode("cloud");
    else if (next === "local") setHostingMode("on-device");
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
          <SettingsGroup>
            {MODES.map((item) => {
              const selected = mode === item.id;
              const blockedLocal =
                item.id === "local" && !status.available;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => select(item.id)}
                  className={cn(
                    "flex w-full flex-col gap-1 border-b border-border/60 px-4 py-3.5 text-left last:border-b-0",
                    selected ? "bg-muted/40" : "hover:bg-muted/30",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[15px] font-medium">{item.title}</span>
                    {selected ? (
                      <span className="text-[12px] text-muted-foreground">
                        Selected
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[13px] leading-snug text-muted-foreground">
                    {item.body}
                  </span>
                  {blockedLocal ? (
                    <span className="text-[12px] text-amber-600 dark:text-amber-400">
                      Not available on this device yet — {status.message}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection title="On-device status">
          <SettingsGroup>
            <SettingsRow label="Apple Intelligence">
              <span className="text-[13px] text-muted-foreground">
                {status.available ? "Ready" : "Unavailable"}
              </span>
            </SettingsRow>
            <SettingsRow label="Status" description={status.message} />
            {status.reason ? (
              <SettingsRow label="Code" description={status.reason} />
            ) : null}
          </SettingsGroup>
          <SettingsFootnote>
            On device requires the Cander iOS app on hardware that supports Apple
            Intelligence. Web and unsupported devices stay on Cloud. LOCAL never
            silently falls back to cloud.
          </SettingsFootnote>
        </SettingsSection>
      </SettingsPanel>
    </SettingsPage>
  );
}
