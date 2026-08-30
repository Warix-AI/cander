"use client";

import { useCallback, useState } from "react";
import { ComputerSpikeViewport } from "@/components/browser/spike/ComputerSpikeViewport";
import {
  fetchComputerSpikeSnapshot,
  runComputerSpikeAgentAction,
  setComputerSpikeControlMode,
  startComputerSpike,
} from "@/lib/api/computer-spike-client";
import type { BrowserObservation } from "@/lib/computer/spike/types";
import type { ControlMode, StreamConnectionState } from "@/lib/computer/spike/types";

function extractFirstRef(snapshot: string): string | null {
  // agent-browser snapshots use either "@e1" or "[ref=e1]"
  const atMatch = snapshot.match(/@e\d+/);
  if (atMatch) {
    return atMatch[0];
  }
  const bracketMatch = snapshot.match(/\[ref=(e\d+)\]/);
  return bracketMatch ? `@${bracketMatch[1]}` : null;
}

export default function ComputerSpikePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [controlMode, setControlMode] = useState<ControlMode>("agent");
  const [connectionState, setConnectionState] =
    useState<StreamConnectionState>("disconnected");
  const [observation, setObservation] = useState<BrowserObservation | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [agentRef, setAgentRef] = useState("");

  const start = useCallback(async () => {
    setLoading(true);
    setStatus("Creating Vercel Sandbox + agent-browser…");
    const result = await startComputerSpike("https://canderhq.com");
    setLoading(false);
    if (!result.ok || !result.sessionId) {
      setStatus(result.error ?? "Failed to start spike.");
      return;
    }
    setSessionId(result.sessionId);
    setControlMode(result.controlMode ?? "agent");
    setObservation(result.observation ?? null);
    setAgentRef(extractFirstRef(result.observation?.snapshot ?? "") ?? "");
    setStatus(`Session ${result.sessionId} ready.`);
  }, []);

  const takeControl = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setStatus("Persisting take control…");
    const result = await setComputerSpikeControlMode(sessionId, "user");
    if (!result.ok || result.controlMode !== "user") {
      setStatus(result.error ?? "Take control failed — control_mode not persisted.");
      return;
    }
    setControlMode(result.controlMode);
    setStatus("You have control. Click/type in the viewport.");
  }, [sessionId]);

  const giveBack = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setStatus("Persisting give back…");
    const result = await setComputerSpikeControlMode(sessionId, "agent");
    if (!result.ok || result.controlMode !== "agent") {
      setStatus(result.error ?? "Give back failed — control_mode not persisted.");
      return;
    }
    // Only flip local mode after durable persist succeeds — this re-enables agent click.
    setControlMode(result.controlMode);

    // Ensure a usable ref is present (input may only show the @e1 placeholder).
    if (!agentRef.trim()) {
      const snap = await fetchComputerSpikeSnapshot(sessionId);
      if (snap.ok && snap.observation) {
        setObservation(snap.observation);
        setAgentRef(extractFirstRef(snap.observation.snapshot) ?? "@e1");
      } else if (!agentRef.trim()) {
        setAgentRef("@e1");
      }
    }

    setStatus("Control returned to agent.");
  }, [agentRef, sessionId]);

  const refreshSnapshot = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setStatus("Fetching agent observation snapshot…");
    const result = await fetchComputerSpikeSnapshot(sessionId);
    if (!result.ok || !result.observation) {
      setStatus(result.error ?? "Snapshot failed.");
      return;
    }
    setObservation(result.observation);
    setAgentRef(extractFirstRef(result.observation.snapshot) ?? "");
    setStatus("Observation updated.");
  }, [sessionId]);

  const runAgentClick = useCallback(async () => {
    if (!sessionId || !agentRef) {
      setStatus("No element ref available for agent click.");
      return;
    }
    setStatus(`Agent clicking ${agentRef}…`);
    const result = await runComputerSpikeAgentAction(sessionId, "click", agentRef);
    if (!result.ok || !result.observation) {
      setStatus(result.error ?? "Agent click failed.");
      return;
    }
    setObservation(result.observation);
    setAgentRef(extractFirstRef(result.observation.snapshot) ?? agentRef);
    setStatus(`Agent clicked ${agentRef}. Session state preserved.`);
  }, [agentRef, sessionId]);

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h1 className="text-sm font-medium">Computer Spike (Phase 1.5)</h1>
        <button
          type="button"
          className="rounded-full bg-foreground px-3 py-1 text-xs text-background disabled:opacity-50"
          disabled={loading}
          onClick={() => void start()}
        >
          Start sandbox
        </button>
        <button
          type="button"
          className="rounded-full border border-border px-3 py-1 text-xs disabled:opacity-50"
          disabled={!sessionId}
          onClick={() => void takeControl()}
        >
          Take control
        </button>
        <button
          type="button"
          className="rounded-full border border-border px-3 py-1 text-xs disabled:opacity-50"
          disabled={!sessionId}
          onClick={() => void giveBack()}
        >
          Give back
        </button>
        <button
          type="button"
          className="rounded-full border border-border px-3 py-1 text-xs disabled:opacity-50"
          disabled={!sessionId}
          onClick={() => void refreshSnapshot()}
        >
          Agent snapshot
        </button>
        <button
          type="button"
          className="rounded-full border border-border px-3 py-1 text-xs disabled:opacity-50"
          disabled={
            !sessionId ||
            controlMode !== "agent" ||
            !agentRef.trim()
          }
          onClick={() => void runAgentClick()}
        >
          Agent click {agentRef.trim() || "ref"}
        </button>
        <span className="text-xs text-muted-foreground">{status}</span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_360px]">
        <div className="min-h-0 border-r border-border">
          {sessionId ? (
            <ComputerSpikeViewport
              sessionId={sessionId}
              controlMode={controlMode}
              onConnectionStateChange={setConnectionState}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Start a sandbox to load canderhq.com
            </div>
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-3 overflow-auto p-4 text-xs">
          <div>
            <div className="mb-1 font-medium">Connection</div>
            <div className="text-muted-foreground">{connectionState}</div>
          </div>
          <div>
            <div className="mb-1 font-medium">Session</div>
            <div className="break-all text-muted-foreground">{sessionId ?? "—"}</div>
          </div>
          <div>
            <div className="mb-1 font-medium">Page</div>
            <div className="text-muted-foreground">{observation?.title ?? "—"}</div>
            <div className="break-all text-muted-foreground">{observation?.url ?? "—"}</div>
          </div>
          <div>
            <div className="mb-1 font-medium">Agent ref (first interactive)</div>
            <input
              className="w-full rounded border border-border bg-background px-2 py-1"
              value={agentRef}
              onChange={(event) => setAgentRef(event.target.value)}
              placeholder="@e1"
            />
          </div>
          <div className="min-h-0 flex-1">
            <div className="mb-1 font-medium">Accessibility snapshot</div>
            <pre className="max-h-[50vh] overflow-auto rounded border border-border bg-muted/30 p-2 text-[10px] leading-relaxed whitespace-pre-wrap">
              {observation?.snapshot ?? "No snapshot yet."}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  );
}
