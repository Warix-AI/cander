"use client";

import { useCallback, useEffect, useState } from "react";
import { BuilderV2SiteRenderer } from "@/components/build-v2/SiteRenderer";
import type { V2ProjectConfig } from "@/lib/build/v2/types";

/**
 * Lightweight V2 preview host — renders config JSON, no sandbox.
 * Mount beside existing preview chrome when project.builder_version === v2_config.
 */
export function BuilderV2PreviewHost(props: {
  projectId: string;
  path?: string;
}) {
  const [config, setConfig] = useState<V2ProjectConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(props.projectId)}/builder-v2/mutate`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setConfig(json.config || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [props.projectId]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  useEffect(() => {
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId && detail.projectId !== props.projectId) return;
      setRevision((n) => n + 1);
    };
    window.addEventListener("cander:builder-v2-refresh", onRefresh);
    return () => window.removeEventListener("cander:builder-v2-refresh", onRefresh);
  }, [props.projectId]);

  if (error) {
    return (
      <div style={{ padding: 24, color: "#b91c1c" }}>
        Describe your business in chat to initialize this site.
        <div style={{ marginTop: 8, opacity: 0.7, fontSize: 13 }}>{error}</div>
      </div>
    );
  }
  if (!config) {
    return (
      <div style={{ padding: 24, opacity: 0.6 }}>
        Loading site configuration… Describe your business in chat to get started.
      </div>
    );
  }
  return <BuilderV2SiteRenderer config={config} path={props.path || "/"} />;
}
