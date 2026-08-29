/**
 * Cloud execution adapter — Vercel Sandbox / eve plug-in point.
 * Durable task + revision stores remain Cander-owned.
 *
 * ADR: Prefer a thin custom adapter first; evaluate Vercel eve before growing
 * a large orchestration framework. Sandbox sessions are ephemeral checkpoints,
 * never the permanent draft record.
 */

import type { DurableAiTask } from "./durable-tasks";
import { patchDurableAiTask } from "./durable-tasks";
import { isSandboxEnabled } from "./flags";
import { createCandidateChangeSet } from "./revisions";

export type CloudExecutionAdapter = {
  id: string;
  enqueue: (task: DurableAiTask) => Promise<void>;
};

/**
 * Stub adapter: advances task through reviewing → building → verifying → ready
 * without a real sandbox when the flag is off. When sandbox_enabled, still
 * stubs until Vercel credentials exist — but records the intent.
 */
const stubAdapter: CloudExecutionAdapter = {
  id: "cander-stub",
  async enqueue(task) {
    const sandbox = isSandboxEnabled();
    await patchDurableAiTask(task.id, {
      status: "running",
      progressNote: sandbox
        ? "Building the draft in an isolated environment…"
        : "Building the draft…",
    });

    // Simulated Builder → Verifier pipeline (no real sandbox yet).
    await delay(40);
    if (task.projectId) {
      await createCandidateChangeSet({
        projectId: task.projectId,
        workspaceId: task.workspaceId ?? null,
        summary: `Candidate change for “${task.title}”`,
        workerRunId: task.id,
      });
    }
    await patchDurableAiTask(task.id, {
      status: "verifying",
      progressNote: "Testing the update…",
    });
    await delay(40);
    await patchDurableAiTask(task.id, {
      status: "ready_for_review",
      progressNote: "Ready for review.",
      resultSummary:
        "Draft update is ready for review. Publish only when you choose to.",
    });
  },
};

let active: CloudExecutionAdapter = stubAdapter;

export function setCloudExecutionAdapter(next: CloudExecutionAdapter) {
  active = next;
}

export function getCloudExecutionAdapter(): CloudExecutionAdapter {
  return active;
}

export async function enqueueExecutionJob(task: DurableAiTask) {
  try {
    await active.enqueue(task);
  } catch (err) {
    console.warn("[cander] execution enqueue failed", err);
    await patchDurableAiTask(task.id, {
      status: "failed",
      progressNote: "That work didn’t finish. Tell me if you want to try again.",
    });
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
