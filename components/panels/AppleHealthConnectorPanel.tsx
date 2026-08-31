"use client";

/**
 * Apple Health — local device capability surfaced in Connectors UX.
 * Connect requests HealthKit authorization + local pref.
 * Disconnect clears Cander exposure only (cannot revoke HK grants).
 */

import { useSyncExternalStore } from "react";
import { getNativeCapabilities, isHealthKitFlagEnabled } from "@/lib/native";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { SHELL_PANEL_BODY } from "@/lib/shell-chrome";

function subscribeHealth(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function getHealthSnap() {
  const health = getNativeCapabilities().health;
  return {
    available: health?.availability().available ?? false,
    message: health?.availability().message,
    enabled: health?.isLocallyEnabled() ?? false,
    state: health?.getConnectorState(),
  };
}

export function AppleHealthConnectorPanel() {
  const snap = useSyncExternalStore(
    subscribeHealth,
    getHealthSnap,
    () => ({
      available: false,
      message: "Available on iPhone",
      enabled: false,
      state: undefined,
    }),
  );

  if (!isHealthKitFlagEnabled()) {
    return (
      <div className={SHELL_PANEL_BODY}>
        <PanelChrome kicker="Connector" title="Apple Health" />
        <p className="px-4 text-[13px] text-muted-foreground">
          Apple Health is not enabled in this build.
        </p>
      </div>
    );
  }

  return (
    <div className={SHELL_PANEL_BODY}>
      <PanelChrome kicker="Local device" title="Apple Health" />
      <div className="space-y-3 px-4 py-2 text-[13px] text-muted-foreground">
        {!snap.available ? (
          <p>{snap.message || "Available on iPhone"}</p>
        ) : (
          <>
            <p>
              Cander can answer questions about your steps, workouts, active
              energy, resting heart rate, and sleep. Metrics stay on-device;
              raw samples are discarded after answering.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {!snap.enabled ? (
                <button
                  type="button"
                  className="rounded-full bg-foreground px-4 py-1.5 text-[13px] font-medium text-background"
                  onClick={() => {
                    void getNativeCapabilities().health?.connect().then(() => {
                      window.dispatchEvent(new Event("storage"));
                    });
                  }}
                >
                  Connect
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-full border border-border px-4 py-1.5 text-[13px]"
                  onClick={() => {
                    getNativeCapabilities().health?.disconnect();
                    window.dispatchEvent(new Event("storage"));
                  }}
                >
                  Disconnect
                </button>
              )}
              <button
                type="button"
                className="rounded-full border border-border px-4 py-1.5 text-[13px]"
                onClick={() => {
                  void getNativeCapabilities().health?.openSystemHealthSettings();
                }}
              >
                Manage Apple Health Access
              </button>
            </div>
            {snap.enabled ? (
              <p className="text-[12px]">
                Connected in Cander
                {snap.state?.authorizationRequestCompleted
                  ? " · authorization requested"
                  : ""}
                . Disconnecting here does not revoke iOS Health permissions.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
