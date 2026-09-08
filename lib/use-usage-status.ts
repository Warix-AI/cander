"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { hourlyUsage } from "@/lib/hourly-usage";
import type { UsageStatusSnapshot } from "@/lib/usage/types";

const USAGE_BAR_THRESHOLD = 70;

export { USAGE_BAR_THRESHOLD };

export function useUsageSnapshot(): {
  snapshot: UsageStatusSnapshot | null;
  loaded: boolean;
} {
  const { workspaceId } = useApp();
  const [snapshot, setSnapshot] = useState<UsageStatusSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured() || !workspaceId) {
      setSnapshot(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) setLoaded(true);
          return;
        }
        const response = await fetch(
          `/api/usage/status?workspaceId=${encodeURIComponent(workspaceId)}`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          },
        );
        const data = (await response.json().catch(() => ({}))) as {
          usage?: UsageStatusSnapshot;
        };
        if (!cancelled) {
          setSnapshot(response.ok ? (data.usage ?? null) : null);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    };
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [workspaceId]);

  return { snapshot, loaded };
}

export function useUsageStatusPercent(): {
  percent: number;
  label: string;
  loaded: boolean;
} {
  const { snapshot, loaded } = useUsageSnapshot();

  if (snapshot?.accountSpend) {
    const spend = snapshot.accountSpend;
    return {
      percent: spend.percentUsed,
      label:
        spend.status === "exhausted"
          ? "Account usage budget reached"
          : spend.status === "approaching"
            ? "Approaching account usage budget"
            : `${spend.percentUsed}% of account usage`,
      loaded,
    };
  }

  const aiChat = snapshot?.features.find((feature) => feature.feature === "ai_chat");
  if (aiChat?.percentUsed != null) {
    return {
      percent: aiChat.percentUsed,
      label:
        aiChat.status === "throttled"
          ? "Approaching monthly allowance"
          : aiChat.status === "limited"
            ? "Monthly allowance reached"
            : `${aiChat.percentUsed}% of monthly AI usage`,
      loaded,
    };
  }

  // Only use demo % when we have no live snapshot at all.
  if (!loaded) {
    return { percent: 0, label: "Loading…", loaded };
  }
  if (snapshot) {
    return {
      percent: 0,
      label: "Account usage",
      loaded,
    };
  }

  const demo = hourlyUsage();
  return {
    percent: demo.percent,
    label: `${demo.percent}% hourly usage`,
    loaded,
  };
}
