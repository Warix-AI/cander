"use client";

import { useRef, useState } from "react";
import { Briefcase, ImagePlus, UserRound, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { WorkspaceMark } from "@/components/shell/WorkspaceMark";
import { Modal } from "@/components/ui/Modal";
import { workspacesFor } from "@/lib/entitlements";
import {
  createWorkspace,
  getWorkspaceCatalogSnapshot,
} from "@/lib/workspace-catalog";
import {
  readWorkspaceIconFile,
  setWorkspaceIcon,
} from "@/lib/workspace-icons";
import { ensurePolicy } from "@/lib/workspace-policy";
import { cn } from "@/lib/utils";

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
  const [includeWork, setIncludeWork] = useState(true);
  const [includePersonal, setIncludePersonal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const open = overlay === "workspace";
  const allowed = workspacesFor(actor, entitlements);
  const atCap = allowed.length >= entitlements.workspaceCap;
  const canCreate = entitlements.canManageWorkspaces && !atCap;

  const reset = () => {
    setName("");
    setIconPreview(null);
    setIncludeWork(true);
    setIncludePersonal(true);
    setError(null);
  };

  const handleClose = () => {
    reset();
    closeOverlay();
  };

  const submit = () => {
    if (!canCreate) return;
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
    const created = createWorkspace({
      name: trimmed,
      includeWork,
      includePersonal,
    });
    if (!created) {
      setError("Could not create workspace.");
      return;
    }
    ensurePolicy(created.id, orgMembers[0]?.id ?? actor.id, created.spaces);
    if (iconPreview) setWorkspaceIcon(created.id, iconPreview);
    setWorkspace(created.id);
    reset();
    closeOverlay();
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
            New workspace
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Name it, pick an icon, and choose which spaces to show.
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
          submit();
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
            className="h-10 w-full rounded-[10px] border border-border bg-card px-3 text-[13.5px] outline-none focus:border-foreground/20 disabled:opacity-40"
          />
        </label>

        <fieldset disabled={!canCreate} className="space-y-2 disabled:opacity-40">
          <legend className="mb-1.5 text-[12px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
            Spaces
          </legend>
          <SpaceToggle
            icon={Briefcase}
            title="Work"
            description="Team inbox and shared work. Turn off for personal-only."
            checked={includeWork}
            onChange={setIncludeWork}
          />
          <SpaceToggle
            icon={UserRound}
            title="Personal"
            description="Private life space. Hide it for team workspaces."
            checked={includePersonal}
            onChange={setIncludePersonal}
          />
        </fieldset>

        {atCap ? (
          <p className="text-[12.5px] text-muted-foreground">
            Workspace limit reached for this plan.
          </p>
        ) : !entitlements.canManageWorkspaces ? (
          <p className="text-[12.5px] text-muted-foreground">
            Ask an admin to create workspaces.
          </p>
        ) : null}
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canCreate || !name.trim()}
            className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium tracking-[-0.01em] text-primary-foreground disabled:opacity-40"
          >
            Create
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

function SpaceToggle({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: typeof Briefcase;
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-start gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors duration-200",
        checked
          ? "border-foreground/15 bg-card"
          : "border-border bg-muted/30 opacity-80 hover:opacity-100",
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]",
          checked ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium tracking-[-0.01em]">
          {title}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
          {description}
        </span>
      </span>
      <span
        className={cn(
          "relative mt-1 h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-primary" : "bg-border",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-card shadow-sm transition-transform duration-200",
            checked && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}
