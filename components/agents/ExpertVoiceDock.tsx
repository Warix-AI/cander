"use client";

import { useEffect, useState } from "react";
import { VoiceControl } from "@/components/shell/VoiceControl";
import { loadAgentBundleClient } from "@/lib/agents/client";
import { peekCachedAgentBundle } from "@/lib/agents/cache";

/** Compact voice entry when an Expert has voice enabled (observe-only chat). */
export function ExpertVoiceDock(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string | null;
  enabled: boolean;
}) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  useEffect(() => {
    if (!opts.enabled || !opts.agentId) {
      setVoiceEnabled(false);
      return;
    }
    const peek = peekCachedAgentBundle(
      opts.workspaceId,
      opts.projectId,
      opts.agentId,
    );
    if (peek) {
      setVoiceEnabled(Boolean(peek.agent.voiceEnabled));
    }
    let cancelled = false;
    void loadAgentBundleClient({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      agentId: opts.agentId,
    })
      .then((bundle) => {
        if (!cancelled) setVoiceEnabled(Boolean(bundle.agent.voiceEnabled));
      })
      .catch(() => {
        if (!cancelled) setVoiceEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [opts.enabled, opts.agentId, opts.workspaceId, opts.projectId]);

  if (!opts.enabled || !opts.agentId || !voiceEnabled) return null;

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 py-2.5 sm:px-6">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted-foreground">
          Voice is on for this Expert — talk or use the orb.
        </p>
        <VoiceControl />
      </div>
    </div>
  );
}
