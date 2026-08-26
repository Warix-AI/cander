"use client";

import { useRef, useState } from "react";
import {
  Briefcase,
  ImagePlus,
  Users,
  X,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { WorkspaceMark } from "@/components/shell/WorkspaceMark";
import { Modal } from "@/components/ui/Modal";
import {
  createWorkspace,
  getWorkspaceCatalogSnapshot,
} from "@/lib/workspace-catalog";
import {
  readWorkspaceIconFile,
  setWorkspaceIcon,
} from "@/lib/workspace-icons";
import {
  emailFitsWorkspaceKind,
  emailWorkspaceMismatchMessage,
  workspaceKindLabel,
} from "@/lib/workspace-kind";
import type { WorkspaceKind } from "@/lib/types";
import { ensurePolicy } from "@/lib/workspace-policy";
import { cn } from "@/lib/utils";

type Step = "kind" | "details";

export function WorkspaceModal() {
  const {
    overlay,
    closeOverlay,
    setWorkspace,
    orgMembers,
    actor,
    entitlements,
  } = useApp();
  const [step, setStep] = useState<Step>("kind");
  const [kind, setKind] = useState<WorkspaceKind | null>(null);
  const [name, setName] = useState("");
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const open = overlay === "workspace";

  const canPersonal = entitlements.canCreatePersonalWorkspace;
  const canBusiness = entitlements.canCreateBusinessWorkspace;
  const canCreate =
    kind === "personal"
      ? canPersonal
      : kind === "business"
        ? canBusiness
        : canPersonal || canBusiness;

  const reset = () => {
    setStep("kind");
    setKind(null);
    setName("");
    setIconPreview(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    closeOverlay();
  };

  const pickKind = (next: WorkspaceKind) => {
    if (next === "personal" && !canPersonal) return;
    if (next === "business" && !canBusiness) return;
    if (next === "business" && !emailFitsWorkspaceKind("business", actor.email)) {
      setError(
        emailWorkspaceMismatchMessage("business", actor.email) ??
          "Business workspaces need a company email.",
      );
      return;
    }
    if (next === "personal" && !emailFitsWorkspaceKind("personal", actor.email)) {
      setError(
        emailWorkspaceMismatchMessage("personal", actor.email) ??
          "Personal workspaces need a personal email.",
      );
      return;
    }
    setError(null);
    setKind(next);
    setStep("details");
  };

  const submit = () => {
    if (!kind || !canCreate) return;
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
    const created = createWorkspace({ name: trimmed, kind });
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
            {step === "kind"
              ? "Create a workspace"
              : `New ${kind ? workspaceKindLabel(kind).toLowerCase() : ""} workspace`}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {step === "kind"
              ? "Choose personal or business. Same UI either way."
              : "Name it and optionally add an icon for the rail."}
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

      {step === "kind" ? (
        <div className="space-y-2 px-5 pb-5">
          <KindCard
            icon={Users}
            title="Personal Workspace"
            description="Create with friends, family, classmates, or other people in your life."
            disabled={!canPersonal}
            onClick={() => pickKind("personal")}
          />
          <KindCard
            icon={Briefcase}
            title="Business Workspace"
            description="Create for a company, organization, or professional team."
            disabled={!canBusiness}
            onClick={() => pickKind("business")}
          />
          {!canBusiness ? (
            <p className="pt-1 text-[12.5px] text-muted-foreground">
              Business workspaces need Max or Ultra with Owner/Admin access.
            </p>
          ) : null}
          {error ? (
            <p className="text-[12.5px] text-destructive">{error}</p>
          ) : null}
        </div>
      ) : (
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

          <p className="text-[12.5px] text-muted-foreground">
            Includes Work, Build, and Explore — same layout for personal and
            business workspaces.
            {kind === "personal"
              ? " Roles are Owner and Member."
              : " Full business roles, seats, and admin tools apply."}
          </p>

          {error ? (
            <p className="text-[12.5px] text-destructive">{error}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setStep("kind");
                setError(null);
              }}
              className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Back
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
      )}

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

function KindCard({
  icon: Icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: typeof Users;
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "light-surface light-surface-interactive flex w-full items-start gap-3 rounded-[10px] px-3 py-3 text-left",
        disabled
          ? "cursor-not-allowed opacity-40"
          : undefined,
      )}
    >
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-muted text-foreground">
        <Icon className="h-4 w-4" strokeWidth={1.6} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium tracking-[-0.01em]">
          {title}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}
