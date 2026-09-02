"use client";

import { useCallback, useState } from "react";
import { useWorkspaceCtx } from "@/components/app/SpaceDataProvider";
import {
  CreateProjectModal,
  type CreateProjectDraft,
  type CreateProjectResult,
} from "@/components/overlays/CreateProjectModal";
import { useSpaceMutation } from "@/lib/hooks/use-space-query";
import type { ProjectKind } from "@/lib/space-entities";
import type { SpaceId } from "@/lib/types";

export function useCreateProjectFlow(onCreated: (projectId: string) => void) {
  const ctx = useWorkspaceCtx();
  const { createProject } = useSpaceMutation();
  const [draft, setDraft] = useState<CreateProjectDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const openCreate = useCallback(
    (input: {
      space: SpaceId;
      kind: ProjectKind;
      defaultTitle: string;
      summary?: string;
    }) => {
      setDraft({
        space: input.space,
        kind: input.kind,
        defaultTitle: input.defaultTitle,
        summary: input.summary,
      });
    },
    [],
  );

  const closeCreate = useCallback(() => {
    if (busy) return;
    setDraft(null);
  }, [busy]);

  const submitCreate = useCallback(
    async (result: CreateProjectResult) => {
      if (!draft || busy) return;
      setBusy(true);
      try {
        const project = await createProject(ctx, {
          space: draft.space,
          title: result.title,
          kind: result.kind,
          summary: result.summary,
          cover: result.cover,
        });
        setDraft(null);
        onCreated(project.id);
      } finally {
        setBusy(false);
      }
    },
    [busy, createProject, ctx, draft, onCreated],
  );

  const modal = (
    <CreateProjectModal
      open={Boolean(draft)}
      draft={draft}
      busy={busy}
      onClose={closeCreate}
      onSubmit={submitCreate}
    />
  );

  return { openCreate, busy, modal };
}
