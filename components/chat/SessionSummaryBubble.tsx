"use client";

import { useState } from "react";
import { ChevronDown, Pencil, Trash2, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { cn } from "@/lib/utils";

export function SessionSummaryBubble({
  threadId,
  summary,
}: {
  threadId: string;
  summary: string;
}) {
  const {
    clearSessionSummary,
    updateSessionSummary,
    deleteChat,
    threads,
    view,
  } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(summary);
  const [deleteBlockedOpen, setDeleteBlockedOpen] = useState(false);
  const linkedProjectId = threads.find((item) => item.id === threadId)?.projectId;
  const hideChatDelete = view === "space";

  return (
    <div className="rounded-[10px] border border-border bg-muted/40">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
            Last chat
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug tracking-[-0.01em] text-foreground">
            {open ? null : summary}
            {open ? "Session context" : null}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          strokeWidth={1.6}
        />
      </button>

      {open ? (
        <div className="border-t border-border px-3 pt-2.5 pb-3">
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                className="w-full rounded-[10px] border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-foreground/20"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(summary);
                    setEditing(false);
                  }}
                  className="inline-flex h-8 items-center rounded-full px-3 text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateSessionSummary(draft, threadId);
                    setEditing(false);
                  }}
                  className="inline-flex h-8 items-center rounded-full bg-primary px-3 text-[12.5px] font-medium text-primary-foreground"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[13px] leading-relaxed text-foreground">
                {summary}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(summary);
                    setEditing(true);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => clearSessionSummary(threadId)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.6} />
                  Dismiss
                </button>
                {hideChatDelete ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      if (linkedProjectId) {
                        setDeleteBlockedOpen(true);
                        return;
                      }
                      deleteChat(threadId);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                    Delete chat
                  </button>
                )}
              </div>
              {deleteBlockedOpen ? (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  This chat is tied to its project. Delete the project to remove it.{" "}
                  <button
                    type="button"
                    onClick={() => setDeleteBlockedOpen(false)}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    OK
                  </button>
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
