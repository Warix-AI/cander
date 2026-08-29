/**
 * Durable AI tasks — Supabase-backed with in-memory fallback.
 * Cander Cloud owns durable state; Sandbox is never the source of truth.
 */

import { isSupabaseConfigured } from "@/lib/data-backend";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AiTaskStatus } from "@/lib/ai/intelligence/types";
import {
  createWorkTask as createMemoryWorkTask,
  formatWorkTaskProgressForUser,
  getWorkTask as getMemoryWorkTask,
  type WorkTask,
  type WorkTaskKind,
} from "@/lib/ai/work-tasks";

// enqueueExecutionJob imported lazily to avoid circular deps with execution-adapter.

export type DurableAiTask = {
  id: string;
  workspaceId?: string | null;
  threadId: string;
  projectId?: string | null;
  draftRevisionId?: string | null;
  title: string;
  goal: string;
  kind: WorkTaskKind;
  taskType: string;
  status: AiTaskStatus;
  progressNote: string;
  acceptanceCriteria?: string | null;
  facts?: Record<string, unknown> | null;
  routingDecision?: Record<string, unknown> | null;
  resultSummary?: string | null;
  idempotencyKey?: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: Record<string, unknown>): DurableAiTask {
  return {
    id: String(row.id),
    workspaceId: row.workspace_id ? String(row.workspace_id) : null,
    threadId: String(row.thread_id),
    projectId: row.project_id ? String(row.project_id) : null,
    draftRevisionId: row.draft_revision_id
      ? String(row.draft_revision_id)
      : null,
    title: String(row.title ?? "Work task"),
    goal: String(row.goal ?? ""),
    kind: (row.kind as WorkTaskKind) || "coding",
    taskType: String(row.task_type ?? "execution"),
    status: (row.status as AiTaskStatus) || "queued",
    progressNote: String(
      row.progress_note ??
        "Working on that — I’ll update this chat when there’s progress.",
    ),
    acceptanceCriteria: row.acceptance_criteria
      ? String(row.acceptance_criteria)
      : null,
    facts: (row.facts as Record<string, unknown>) ?? null,
    routingDecision: (row.routing_decision as Record<string, unknown>) ?? null,
    resultSummary: row.result_summary ? String(row.result_summary) : null,
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function memoryAsDurable(task: WorkTask): DurableAiTask {
  return {
    id: task.id,
    threadId: task.threadId,
    title: task.title,
    goal: task.goal,
    kind: task.kind,
    taskType: "execution",
    status:
      task.status === "queued"
        ? "queued"
        : task.status === "running"
          ? "running"
          : task.status === "failed"
            ? "failed"
            : "ready_for_review",
    progressNote: task.progressNote,
    resultSummary: task.resultSummary,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export function formatDurableTaskProgress(task: DurableAiTask): string {
  if (task.status === "ready_for_review" || task.status === "published") {
    if (task.resultSummary?.trim()) return task.resultSummary.trim();
  }
  if (task.status === "failed") {
    return "That work didn’t finish. Tell me if you want to try again.";
  }
  if (task.status === "verifying") {
    return "Testing the update…";
  }
  if (task.status === "running") {
    return task.progressNote.trim() || "Building the draft…";
  }
  if (task.status === "queued") {
    return task.progressNote.trim() || "Reviewing your project…";
  }
  return (
    task.progressNote.trim() ||
    "Working on that — I’ll update this chat when there’s progress."
  );
}

export async function createDurableAiTask(input: {
  threadId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  draftRevisionId?: string | null;
  title: string;
  goal: string;
  kind: WorkTaskKind;
  summary?: string;
  routingDecision?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
}): Promise<DurableAiTask> {
  const progressNote =
    input.summary?.trim() ||
    "Reviewing your project — I’ll update this chat when there’s progress.";

  const workspaceId = input.workspaceId?.trim() || null;

  if (isSupabaseConfigured()) {
    try {
      // Fail closed: never insert into the null-workspace shared bucket.
      if (!workspaceId) {
        console.warn(
          "[cander] ai_tasks require workspaceId; using memory fallback",
        );
      } else {
        const supabase = createSupabaseBrowserClient();
        const row = {
          workspace_id: workspaceId,
          thread_id: input.threadId,
          project_id: input.projectId || null,
          draft_revision_id: input.draftRevisionId || null,
          title: input.title.trim() || "Work task",
          goal: input.goal.trim() || input.title.trim(),
          kind: input.kind,
          task_type: "execution",
          status: "queued",
          progress_note: progressNote,
          routing_decision: input.routingDecision ?? null,
          idempotency_key: input.idempotencyKey ?? null,
          facts: {},
        };
        const { data, error } = await supabase
          .from("ai_tasks")
          .insert(row)
          .select("*")
          .single();
        if (!error && data) {
          const task = mapRow(data as Record<string, unknown>);
          void import("./execution-adapter").then((m) =>
            m.enqueueExecutionJob(task),
          );
          return task;
        }
        console.warn("[cander] ai_tasks insert failed", error?.message);
      }
    } catch (err) {
      console.warn("[cander] ai_tasks unavailable", err);
    }
  }

  const mem = createMemoryWorkTask({
    threadId: input.threadId,
    title: input.title,
    goal: input.goal,
    kind: input.kind,
    summary: progressNote,
  });
  const task = memoryAsDurable(mem);
  void import("./execution-adapter").then((m) => m.enqueueExecutionJob(task));
  return task;
}

export async function getDurableAiTask(
  id: string | null | undefined,
): Promise<DurableAiTask | null> {
  if (!id) return null;
  if (isSupabaseConfigured()) {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("ai_tasks")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!error && data) return mapRow(data as Record<string, unknown>);
    } catch {
      // fall through
    }
  }
  const mem = getMemoryWorkTask(id);
  return mem ? memoryAsDurable(mem) : null;
}

export async function patchDurableAiTask(
  id: string,
  patch: Partial<{
    status: AiTaskStatus;
    progressNote: string;
    resultSummary: string | null;
    facts: Record<string, unknown>;
  }>,
): Promise<DurableAiTask | null> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createSupabaseBrowserClient();
      const body: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (patch.status) body.status = patch.status;
      if (patch.progressNote !== undefined) body.progress_note = patch.progressNote;
      if (patch.resultSummary !== undefined) {
        body.result_summary = patch.resultSummary;
      }
      if (patch.facts) body.facts = patch.facts;
      const { data, error } = await supabase
        .from("ai_tasks")
        .update(body)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (!error && data) return mapRow(data as Record<string, unknown>);
    } catch {
      // fall through
    }
  }
  const mem = getMemoryWorkTask(id);
  if (!mem) return null;
  if (patch.progressNote) mem.progressNote = patch.progressNote;
  if (patch.resultSummary !== undefined) mem.resultSummary = patch.resultSummary;
  if (patch.status === "failed") mem.status = "failed";
  if (patch.status === "running") mem.status = "running";
  if (patch.status === "ready_for_review" || patch.status === "published") {
    mem.status = "completed";
  }
  mem.updatedAt = new Date().toISOString();
  return memoryAsDurable(mem);
}

export async function listDurableAiTasksForThread(
  threadId: string,
): Promise<DurableAiTask[]> {
  if (!threadId) return [];
  if (isSupabaseConfigured()) {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("ai_tasks")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!error && data?.length) {
        return data.map((row) => mapRow(row as Record<string, unknown>));
      }
    } catch {
      // fall through
    }
  }
  return [...byIdMemoryFallback(threadId)];
}

function byIdMemoryFallback(threadId: string): DurableAiTask[] {
  // Memory store has no list API — scan via create path is not exposed;
  // return empty when cloud is unavailable after refresh.
  void threadId;
  return [];
}

export { formatWorkTaskProgressForUser };
