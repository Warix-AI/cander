"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { WorkspaceMark } from "@/components/shell/WorkspaceMark";
import { Modal } from "@/components/ui/Modal";
import { getWorkspaceCatalogSnapshot } from "@/lib/workspace-catalog";
import { createWorkspaceRemote } from "@/lib/supabase/workspace-actions";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  readWorkspaceIconFile,
  setWorkspaceIcon,
} from "@/lib/workspace-icons";
import { emailWorkspaceMismatchMessage } from "@/lib/workspace-kind";
import type { WorkspaceKind } from "@/lib/types";
import { ensurePolicy } from "@/lib/workspace-policy";

function kindForCreate(opts: {
  actorKind: "org" | "personal";
  canPersonal: boolean;
  canBusiness: boolean;
}): WorkspaceKind | null {
  if (opts.actorKind === "org" && opts.canBusiness) return "business";
  if (opts.canPersonal) return "personal";
  if (opts.canBusiness) return "business";
  return null;
}

export function WorkspaceModal() {
  const {
    overlay,
    closeOverlay,
    setWorkspace,
    orgMembers,
    actor,
    entitlements,
  } = useApp();
  const [name, setName] = useState("");
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const open = overlay === "workspace" && entitlements.hasWorkspaces;

  const canPersonal = entitlements.canCreatePersonalWorkspace;
  const canBusiness = entitlements.canCreateBusinessWorkspace;
  const kind = kindForCreate({
    actorKind: actor.kind === "org" ? "org" : "personal",
    canPersonal,
    canBusiness,
  });
  const canCreate = Boolean(kind);

  const reset = () => {
    setName("");
    setIconPreview(null);
    setError(null);
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    closeOverlay();
  };

  const submit = async () => {
    if (!kind || !canCreate || busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the workspace a name.");
      return;
    }
    if (
      getWorkspaceCatalogSnapshot().some(
        (item) => item.name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      setError("A workspace with that name already exists.");
      return;
    }
    const mismatch = emailWorkspaceMismatchMessage(kind, actor.email);
    if (mismatch) {
      setError(mismatch);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      let userId = actor.id;
      if (isSupabaseConfigured()) {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Sign in to create a workspace.");
        userId = user.id;
      }
      const created = await createWorkspaceRemote({
        name: trimmed,
        kind,
        userId,
      });
      ensurePolicy(created.id, orgMembers[0]?.id ?? actor.id, created.spaces);
      if (iconPreview) setWorkspaceIcon(created.id, iconPreview);
      setWorkspace(created.id);
      reset();
      closeOverlay();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create workspace.",
      );
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      labelledBy="workspace-builder-title"
      className="w-full max-w-[24rem]"
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <h2
            id="workspace-builder-title"
            className="text-[16px] font-semibold tracking-[-0.03em]"
          >
            Create a workspace
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Name it and optionally add an icon for the rail.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={handleClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </div>

      <form
        className="space-y-4 px-5 pb-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            title="Upload icon"
            aria-label="Upload icon"
            disabled={!canCreate}
            onClick={() => input.current?.click()}
            className="relative shrink-0 disabled:opacity-40"
          >
            {iconPreview ? (
              <span className="inline-flex h-10 w-10 overflow-hidden rounded-[10px]">
                <img
                  src={iconPreview}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </span>
            ) : (
              <WorkspaceMark
                id="new"
                name={name.trim() || "Workspace"}
                className="bg-muted text-muted-foreground"
              />
            )}
          </button>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => input.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-foreground/15 px-3.5 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted disabled:opacity-40"
          >
            <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.6} />
            {iconPreview ? "Replace icon" : "Add icon"}
          </button>
          {iconPreview ? (
            <button
              type="button"
              onClick={() => setIconPreview(null)}
              className="text-[13px] text-muted-foreground hover:text-foreground"
            >
              Remove
            </button>
          ) : null}
        </div>

        <label className="block">
          <span className="sr-only">Workspace name</span>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            disabled={!canCreate}
            placeholder="Workspace name"
            autoFocus
            className="h-10 w-full rounded-[12px] border border-border bg-background px-3 text-[13.5px] outline-none focus:border-foreground/20 disabled:opacity-40"
          />
        </label>

        <p className="text-[12.5px] text-muted-foreground">
          Includes Home, Work, Build, and Studio.
        </p>

        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="submit"
            disabled={!canCreate || !name.trim() || busy}
            className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-[13px] font-medium tracking-[-0.01em] text-primary-foreground disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void readWorkspaceIconFile(file)
            .then((dataUrl) => {
              setIconPreview(dataUrl);
              setError(null);
            })
            .catch((err: unknown) => {
              setError(
                err instanceof Error ? err.message : "Could not upload image.",
              );
            });
        }}
      />
    </Modal>
  );
}
