/**
 * High-level work tasks for future cloud workers / Vercel Sandbox.
 * Local model may create a task; backend decides execution (stubbed for now).
 */

export type WorkTaskKind = "coding" | "research" | "multi_step";

export type WorkTaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type WorkTask = {
  id: string;
  threadId: string;
  title: string;
  goal: string;
  kind: WorkTaskKind;
  status: WorkTaskStatus;
  progressNote: string;
  resultSummary?: string | null;
  createdAt: string;
  updatedAt: string;
};

const byId = new Map<string, WorkTask>();

function newId() {
  return `wt-${Math.random().toString(36).slice(2, 10)}`;
}

export function createWorkTask(input: {
  threadId: string;
  title: string;
  goal: string;
  kind: WorkTaskKind;
  summary?: string;
}): WorkTask {
  const now = new Date().toISOString();
  const task: WorkTask = {
    id: newId(),
    threadId: input.threadId,
    title: input.title.trim() || "Work task",
    goal: input.goal.trim() || input.title.trim(),
    kind: input.kind,
    status: "queued",
    progressNote:
      input.summary?.trim() ||
      "Working on that — I’ll update this chat when there’s progress.",
    resultSummary: null,
    createdAt: now,
    updatedAt: now,
  };
  byId.set(task.id, task);
  // Backend will later call planWorkTaskExecution(task).
  return task;
}

export function getWorkTask(id: string | null | undefined): WorkTask | null {
  if (!id) return null;
  return byId.get(id) ?? null;
}

export function formatWorkTaskProgressForUser(task: WorkTask): string {
  if (task.status === "completed" && task.resultSummary?.trim()) {
    return task.resultSummary.trim();
  }
  if (task.status === "failed") {
    return "That work didn’t finish. Tell me if you want to try again.";
  }
  return (
    task.progressNote.trim() ||
    "Working on that — I’ll update this chat when there’s progress."
  );
}

/**
 * Future: backend chooses one cloud worker, Vercel Sandbox, or focused subagents.
 * Must NOT be invoked by the local model — orchestration stays server-side.
 */
export function planWorkTaskExecution(_task: WorkTask): {
  mode: "stub";
  note: string;
} {
  return {
    mode: "stub",
    note: "Execution planner not wired yet — task queued only.",
  };
}

/** Test helper */
export function clearAllWorkTasks() {
  byId.clear();
}
