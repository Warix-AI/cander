/**
 * Cloud execution adapter — client-side enqueue delegates to server API when sandbox enabled.
 */

import type { DurableAiTask } from "./durable-tasks";
import { patchDurableAiTask } from "./durable-tasks";
import { isSandboxEnabled } from "./flags";
import { createCandidateChangeSet } from "./revisions";

export type CloudExecutionAdapter = {
  id: string;
  enqueue: (task: DurableAiTask) => Promise<void>;
};

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

    await delay(40);
    if (task.projectId && task.workspaceId) {
      await createCandidateChangeSet({
        projectId: task.projectId,
        workspaceId: task.workspaceId,
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

const apiAdapter: CloudExecutionAdapter = {
  id: "vercel_sandbox_api",
  async enqueue(task) {
    await patchDurableAiTask(task.id, {
      status: "running",
      progressNote: "Starting build environment…",
    });

    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch("/api/computer/build", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify({ taskId: task.id }),
    });

    const data = (await response.json()) as { ok?: boolean; error?: string; resultSummary?: string };
    if (!response.ok || !data.ok) {
      throw new Error(data.error ?? "Build failed.");
    }

    await patchDurableAiTask(task.id, {
      status: "ready_for_review",
      progressNote: "Build complete.",
      resultSummary: data.resultSummary ?? "Build finished in sandbox.",
    });
  },
};

let active: CloudExecutionAdapter = stubAdapter;

export function setCloudExecutionAdapter(next: CloudExecutionAdapter) {
  active = next;
}

export function getCloudExecutionAdapter(): CloudExecutionAdapter {
  if (isSandboxEnabled()) {
    return apiAdapter;
  }
  return active;
}

export async function enqueueExecutionJob(task: DurableAiTask) {
  try {
    await getCloudExecutionAdapter().enqueue(task);
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
