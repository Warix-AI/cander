"use client";

import { useEffect, useRef, useState } from "react";
import { Image, ImagePlus, LayoutTemplate, MonitorPlay } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { BANNER_PRESETS, type BannerPresetId } from "@/lib/space-banners";
import {
  coverValueForCreate,
  type ProjectCoverMode,
} from "@/lib/project-cover";
import { normalizeProjectTitle } from "@/lib/project-name";
import type { ProjectKind } from "@/lib/space-entities";
import type { SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

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

const COVER_OPTIONS: {
  id: ProjectCoverMode;
  label: string;
  hint: string;
  Icon: typeof MonitorPlay;
}[] = [
  {
    id: "first-tab",
    label: "Live preview",
    hint: "First tab in the project",
    Icon: MonitorPlay,
  },
  {
    id: "gradient",
    label: "Gradient",
    hint: "Pick a background wash",
    Icon: LayoutTemplate,
  },
  {
    id: "upload",
    label: "Upload image",
    hint: "Custom cover photo",
    Icon: ImagePlus,
  },
];

const STUDIO_COVER_OPTIONS: typeof COVER_OPTIONS = [
  {
    id: "generated-first",
    label: "First generated image",
    hint: "Uses the first image you generate",
    Icon: Image,
  },
  {
    id: "upload",
    label: "Choose photo",
    hint: "Pick a cover image yourself",
    Icon: ImagePlus,
  },
  {
    id: "gradient",
    label: "Gradient",
    hint: "Pick a background wash",
    Icon: LayoutTemplate,
  },
];

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
  const [coverMode, setCoverMode] = useState<ProjectCoverMode>("first-tab");
  const [gradient, setGradient] = useState<BannerPresetId>("promo");
  const [uploadDataUrl, setUploadDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !draft) return;
    setTitle(draft.defaultTitle);
    setCoverMode(draft.space === "studio" ? "generated-first" : "first-tab");
    setGradient("promo");
    setUploadDataUrl(null);
    setError(null);
  }, [open, draft]);

  if (!draft) return null;

  const submit = async () => {
    const next = normalizeProjectTitle(title);
    if (!next) {
      setError("Add a project name.");
      return;
    }
    if (coverMode === "upload" && !uploadDataUrl) {
      setError("Upload a cover image, or pick another preview style.");
      return;
    }
    setError(null);
    await onSubmit({
      title: next,
      kind: draft.kind,
      summary: draft.summary ?? "",
      cover: coverValueForCreate({
        mode: coverMode,
        gradient,
        uploadDataUrl,
      }),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="create-project-title"
      className="flex w-[min(24rem,calc(100vw-2rem))] flex-col"
    >
      <div className="px-5 pt-5 pb-4">
        <h2
          id="create-project-title"
          className="text-[16px] font-semibold tracking-[-0.03em]"
        >
          New project
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Name it and choose how the card preview looks.
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

        <p className="mt-4 text-[12px] font-medium text-muted-foreground">
          {draft.space === "studio" ? "Card preview" : "Live preview"}
        </p>
        <div className="mt-2 grid gap-1.5">
          {(draft.space === "studio" ? STUDIO_COVER_OPTIONS : COVER_OPTIONS).map(
            (option) => {
            const Icon = option.Icon;
            const active = coverMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setCoverMode(option.id)}
                className={cn(
                  "flex items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-foreground/25 bg-muted/60"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] bg-muted">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.65} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium tracking-[-0.01em]">
                    {option.label}
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {option.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {coverMode === "gradient" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {BANNER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-label={preset.label}
                onClick={() => setGradient(preset.id)}
                className={cn(
                  "h-8 w-10 overflow-hidden rounded-[8px] border-2",
                  gradient === preset.id
                    ? "border-foreground"
                    : "border-transparent",
                )}
              >
                <span
                  className={cn("block h-full w-full", preset.className)}
                />
              </button>
            ))}
          </div>
        ) : null}

        {coverMode === "upload" ? (
          <div className="mt-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const result = reader.result;
                  if (typeof result === "string") setUploadDataUrl(result);
                };
                reader.readAsDataURL(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border px-3 text-[13px] font-medium hover:bg-muted"
            >
              <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.6} />
              {uploadDataUrl ? "Replace image" : "Choose image"}
            </button>
            {uploadDataUrl ? (
              <img
                src={uploadDataUrl}
                alt=""
                className="mt-2 h-20 w-full rounded-[10px] object-cover"
              />
            ) : null}
          </div>
        ) : null}

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
