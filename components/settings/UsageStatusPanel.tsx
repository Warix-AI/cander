"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/SettingsChrome";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { planLabel } from "@/lib/billing";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { UsageStatusSnapshot } from "@/lib/usage/types";

export function UsageStatusPanel() {
  const { workspaceId, entitlements } = useApp();
  const [usage, setUsage] = useState<UsageStatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !workspaceId) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const response = await fetch(
          `/api/usage/status?workspaceId=${encodeURIComponent(workspaceId)}`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (!cancelled) {
            setError(
              typeof data.error === "string"
                ? data.error
                : "Usage status is unavailable right now.",
            );
          }
          return;
        }
        if (!cancelled) {
          setUsage(data.usage ?? null);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("Usage status is unavailable right now.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const plan = usage?.plan ?? entitlements.plan;

  return (
    <SettingsSection
      title="Usage"
      description="Plain-language status for your workspace. Normal use on paid plans should feel unlimited."
    >
      <SettingsGroup>
        <SettingsRow label="Current plan" description={usage?.planLabel ?? planLabel(plan)} />
        {usage?.notices.map((notice) => (
          <SettingsRow key={notice} label="Note" description={notice} />
        ))}
        {error ? <SettingsRow label="Status" description={error} /> : null}
        {!error && usage
          ? usage.features
              .filter((feature) => feature.enabled)
              .slice(0, 6)
              .map((feature) => (
                <SettingsRow
                  key={feature.feature}
                  label={feature.label}
                  description={
                    feature.message ??
                    (feature.status === "available"
                      ? "Available"
                      : feature.status === "throttled"
                        ? "Fair-use throttle active"
                        : "Limited")
                  }
                />
              ))
          : null}
      </SettingsGroup>
    </SettingsSection>
  );
}
