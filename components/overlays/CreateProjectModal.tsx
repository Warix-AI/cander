"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { normalizeProjectTitle } from "@/lib/project-name";
import type { ProjectKind } from "@/lib/space-entities";
import type { SpaceId } from "@/lib/types";

export type CreateProjectDraft = {
  space: SpaceId;
  kind: ProjectKind;
  defaultTitle: string;
  summary?: string;
};

export type CreateProjectResult = {
  title: string;
  kind: ProjectKind;
  summary: string;
  cover?: string;
};

export function CreateProjectModal({
  open,
  draft,
  busy = false,
  onClose,
  onSubmit,
}: {
  open: boolean;
  draft: CreateProjectDraft | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (result: CreateProjectResult) => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !draft) return;
    setTitle("");
    setError(null);
  }, [open, draft]);

  if (!draft) return null;

  const submit = async () => {
    const next = normalizeProjectTitle(title);
    if (!next) {
      setError("Add a project name.");
      return;
    }
    setError(null);
    // Always start on live preview — cover style is adjusted from the project menu.
    await onSubmit({
      title: next,
      kind: draft.kind,
      summary: draft.summary ?? "",
      cover: undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="create-project-title"
      className="flex w-[min(24rem,calc(100vw-2rem))] flex-col"
      backdropClassName="bg-black/30"
    >
      <div className="px-5 pt-5 pb-4">
        <h2
          id="create-project-title"
          className="text-[16px] font-semibold tracking-[-0.03em]"
        >
          New project
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Give it a name to get started.
        </p>

        <label className="mt-4 block">
          <span className="text-[12px] font-medium text-muted-foreground">
            Name
          </span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            spellCheck={false}
            className="mt-1.5 h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[14px] outline-none focus:border-foreground/30"
            placeholder="Project name"
          />
        </label>

        {error ? (
          <p className="mt-3 text-[12.5px] text-destructive">{error}</p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-[10px] px-3.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="inline-flex h-9 items-center rounded-[10px] bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-foreground disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
