"use client";

/**
 * Tap-first field renderers for the website setup card:
 * visual_choice (mini previews), palette, type_sample, upload (identity), urls.
 * Mobile-first: horizontal snap rows, thumb-height targets, no typing needed.
 */

import { useRef, useState } from "react";
import {
  ArrowRight,
  Calendar,
  Check,
  FileText,
  ImagePlus,
  Loader2,
  Mail,
  ShoppingBag,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import {
  AI_CHOICE_VALUE,
  type ClarificationChoice,
  type ClarificationChoicePreview,
  type ClarificationQuestion,
} from "@/lib/ai/clarification/schema";
import type { IdentityAnswer, PaletteAnswer } from "@/lib/ai/build/website-setup-steps";
import { cn } from "@/lib/utils";

const ICONS = {
  calendar: Calendar,
  "file-text": FileText,
  "shopping-bag": ShoppingBag,
  "user-plus": UserPlus,
  mail: Mail,
  "arrow-right": ArrowRight,
} as const;

const tile =
  "group relative flex min-h-[44px] w-[152px] shrink-0 snap-start flex-col overflow-hidden rounded-[12px] border text-left transition sm:w-auto";
const tileIdle = "border-border bg-background hover:border-foreground/30";
const tileOn = "border-foreground ring-1 ring-foreground";

function SelectedMark({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span className="absolute right-1.5 top-1.5 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
      <Check className="h-3 w-3" strokeWidth={2.5} />
    </span>
  );
}

function Preview({ preview, label }: { preview?: ClarificationChoicePreview; label: string }) {
  if (!preview) return null;
  switch (preview.kind) {
    case "style":
      return (
        <div
          className="flex h-[74px] w-full flex-col gap-1.5 p-2.5"
          style={{ background: preview.bg, color: preview.fg, fontFamily: preview.font === "serif" ? "Georgia, serif" : undefined }}
        >
          <div className="flex items-center justify-between">
            <span className="h-1.5 w-8 rounded-full" style={{ background: preview.fg, opacity: 0.85 }} />
            <span className="h-3.5 w-9 rounded-full" style={{ background: preview.accent, borderRadius: preview.radius }} />
          </div>
          <span className="mt-1 text-[11px] font-semibold leading-none">Aa headline</span>
          <span className="h-1 w-4/5 rounded-full" style={{ background: preview.fg, opacity: 0.35 }} />
          <div className="mt-auto flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-3 flex-1" style={{ background: preview.fg, opacity: 0.12, borderRadius: preview.radius }} />
            ))}
          </div>
        </div>
      );
    case "palette":
      return (
        <div className="flex h-[74px] w-full flex-col p-2.5" style={{ background: preview.background, color: preview.foreground }}>
          <div className="flex gap-1">
            {[preview.primary, preview.accent, preview.foreground].map((c, i) => (
              <span key={i} className="h-6 flex-1 rounded-[6px] border border-black/5" style={{ background: c }} />
            ))}
          </div>
          <span className="mt-auto text-[11px] font-medium">{label}</span>
        </div>
      );
    case "type":
      return (
        <div className="flex h-[74px] w-full flex-col justify-center gap-1 bg-background px-2.5 text-foreground">
          <span className="truncate text-[17px] font-semibold leading-tight" style={{ fontFamily: preview.display }}>
            {preview.sample ?? "Grow faster"}
          </span>
          <span className="truncate text-[11px] leading-snug text-muted-foreground" style={{ fontFamily: preview.body }}>
            Body text looks like this.
          </span>
        </div>
      );
    case "component":
      return (
        <div className={cn("flex h-[74px] w-full items-center justify-center bg-muted/60", preview.density === "compact" ? "p-2" : "p-3")}>
          <div
            className="flex w-full flex-col gap-1.5 bg-background p-2 text-foreground"
            style={{ borderRadius: preview.radius, boxShadow: preview.shadow, border: `1px solid ${preview.border}` }}
          >
            <span className="h-1.5 w-10 rounded-full bg-foreground/70" />
            <span className="h-1 w-3/4 rounded-full bg-foreground/25" />
            <span
              className="mt-0.5 h-4 w-12 bg-foreground"
              style={{ borderRadius: preview.button === "pill" ? 999 : preview.button === "square" ? 2 : 6 }}
            />
          </div>
        </div>
      );
    case "layout": {
      const a = preview.arrangement;
      return (
        <div className="flex h-[74px] w-full flex-col gap-1 bg-background p-2 text-foreground">
          <div className="flex items-center justify-between">
            <span className="h-1 w-5 rounded-full bg-foreground/60" />
            <span className="flex gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="h-1 w-2.5 rounded-full bg-foreground/25" />)}</span>
          </div>
          {a === "centered" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-1">
              <span className="h-1.5 w-2/3 rounded-full bg-foreground/70" />
              <span className="h-1 w-1/2 rounded-full bg-foreground/25" />
              <span className="mt-0.5 h-2.5 w-8 rounded bg-foreground" />
            </div>
          )}
          {a === "left" && (
            <div className="flex flex-1 flex-col justify-center gap-1">
              <span className="h-1.5 w-3/4 rounded-full bg-foreground/70" />
              <span className="h-1 w-1/2 rounded-full bg-foreground/25" />
              <span className="h-2.5 w-8 rounded bg-foreground" />
            </div>
          )}
          {a === "split" && (
            <div className="flex flex-1 gap-1.5">
              <div className="flex flex-1 flex-col justify-center gap-1">
                <span className="h-1.5 w-full rounded-full bg-foreground/70" />
                <span className="h-1 w-2/3 rounded-full bg-foreground/25" />
              </div>
              <span className="w-2/5 rounded bg-foreground/15" />
            </div>
          )}
          {a === "bleed" && (
            <div className="relative flex flex-1 items-end rounded bg-gradient-to-t from-foreground/60 to-foreground/15 p-1">
              <span className="h-1.5 w-2/3 rounded-full bg-background" />
            </div>
          )}
          {a === "grid" && (
            <div className="grid flex-1 grid-cols-3 gap-1">
              {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="rounded bg-foreground/15" />)}
            </div>
          )}
        </div>
      );
    }
    case "icon": {
      const Icon = ICONS[preview.name as keyof typeof ICONS] ?? ArrowRight;
      return (
        <div className="flex h-[52px] w-full items-center justify-center bg-muted/50 text-foreground">
          <Icon className="h-5 w-5" strokeWidth={1.6} />
        </div>
      );
    }
  }
}

function ChoiceTile({ choice, on, onClick }: { choice: ClarificationChoice; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(tile, on ? tileOn : tileIdle)} aria-pressed={on}>
      <SelectedMark on={on} />
      <Preview preview={choice.preview} label={choice.label} />
      <div className="flex flex-col px-2.5 py-2">
        <span className="text-[12.5px] font-medium leading-tight">{choice.label}</span>
        {choice.hint ? <span className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{choice.hint}</span> : null}
      </div>
    </button>
  );
}

/** Horizontal snap row on phones, grid on wider screens. */
function TileRow({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        "-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "sm:mx-0 sm:grid sm:overflow-visible sm:px-0",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-3",
        cols === 4 && "sm:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}

export function AiChooseButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition",
        on ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground hover:bg-muted",
      )}
    >
      <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
      {on ? "Candor will decide" : "Let Candor decide"}
    </button>
  );
}

export function VisualChoiceField({
  question,
  value,
  onChange,
}: {
  question: ClarificationQuestion;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const [custom, setCustom] = useState("");
  const choices = question.choices ?? [];
  const isAi = value === AI_CHOICE_VALUE;
  const selected = question.multiple ? (Array.isArray(value) ? value.map(String) : []) : null;
  const isCustom = !isAi && typeof value === "string" && value && !choices.some((c) => c.id === value);
  const iconOnly = choices.every((c) => c.preview?.kind === "icon");
  return (
    <div className="flex flex-col gap-2.5">
      <TileRow cols={iconOnly ? 3 : 3}>
        {choices.map((c) => {
          const on = question.multiple ? Boolean(selected?.includes(c.id)) : value === c.id;
          return (
            <ChoiceTile
              key={c.id}
              choice={c}
              on={on}
              onClick={() => {
                if (question.multiple) {
                  const cur = selected ?? [];
                  onChange(on ? cur.filter((id) => id !== c.id) : [...cur, c.id]);
                } else onChange(on ? undefined : c.id);
              }}
            />
          );
        })}
      </TileRow>
      {question.allowCustom ? (
        <div className="flex items-center gap-2">
          <input
            className="min-h-[40px] flex-1 rounded-[10px] border border-border bg-input px-3 text-[13.5px] outline-none focus:border-foreground/30"
            placeholder="Or type your own…"
            value={isCustom ? String(value) : custom}
            onChange={(e) => {
              setCustom(e.target.value);
              onChange(e.target.value.trim() ? e.target.value : undefined);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

const HEX_RE = /^#?[0-9a-f]{6}$/i;

export function PaletteField({
  question,
  value,
  onChange,
}: {
  question: ClarificationQuestion;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const v: PaletteAnswer =
    value && typeof value === "object"
      ? (value as PaletteAnswer)
      : typeof value === "string" && value
        ? value === "light" || value === "dark"
          ? { mode: value }
          : value === "custom"
            ? { preset: "custom" }
            : { custom: value }
        : {};
  const choices = question.choices ?? [];
  const simpleMode = choices.every(
    (c) => !c.preview || c.preview.kind !== "palette",
  );
  const set = (patch: Partial<PaletteAnswer>) => {
    const next = { ...v, ...patch };
    for (const k of Object.keys(next) as Array<keyof PaletteAnswer>) {
      if (!next[k]) delete next[k];
    }
    onChange(Object.keys(next).length ? next : undefined);
  };
  const selectedId =
    v.preset ||
    (v.mode === "light" || v.mode === "dark" ? v.mode : undefined) ||
    (v.custom ? "custom" : undefined);

  return (
    <div className="flex flex-col gap-3">
      <TileRow cols={simpleMode ? 3 : 4}>
        {choices.map((c) => {
          const on = selectedId === c.id || v.preset === c.id;
          return (
            <ChoiceTile
              key={c.id}
              choice={c}
              on={on}
              onClick={() => {
                if (on) {
                  onChange(undefined);
                  return;
                }
                if (c.id === "light" || c.id === "dark") {
                  set({ mode: c.id, preset: c.id, custom: undefined });
                } else if (c.id === "custom") {
                  set({ preset: "custom", mode: undefined });
                } else {
                  set({ preset: c.id });
                }
              }}
            />
          );
        })}
      </TileRow>
      {!simpleMode ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-border p-0.5">
            {(["light", "dark", "auto"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set({ mode: m })}
                className={cn(
                  "min-h-[32px] rounded-full px-3 text-[12px] capitalize",
                  (v.mode ?? "auto") === m ? "bg-foreground text-background" : "text-muted-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          {(["primary", "accent"] as const).map((k) => (
            <label
              key={k}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border px-2.5 text-[12px]"
            >
              <span
                className="h-4 w-4 rounded-full border border-black/10"
                style={{
                  background:
                    v[k] && HEX_RE.test(v[k]!)
                      ? v[k]!.startsWith("#")
                        ? v[k]
                        : `#${v[k]}`
                      : "transparent",
                }}
              />
              <span className="capitalize text-muted-foreground">{k}</span>
              <input
                className="w-[74px] bg-transparent font-mono text-[12px] outline-none"
                placeholder="#hex"
                value={v[k] ?? ""}
                onChange={(e) =>
                  set({ [k]: e.target.value.trim() || undefined } as Partial<PaletteAnswer>)
                }
              />
            </label>
          ))}
        </div>
      ) : null}
      {simpleMode && (selectedId === "custom" || v.preset === "custom" || Boolean(v.custom)) ? (
        <textarea
          className="min-h-[72px] w-full resize-y rounded-[10px] border border-border bg-input px-3 py-2 text-[13.5px] outline-none focus:border-foreground/30"
          placeholder='e.g. black, white, cyan accent — or #0B1020, #F4F7FC, #28D7F5'
          value={v.custom ?? ""}
          onChange={(e) => set({ preset: "custom", custom: e.target.value.trim() || undefined })}
        />
      ) : null}
    </div>
  );
}

export function TypeSampleField({
  question,
  value,
  onChange,
}: {
  question: ClarificationQuestion;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  return (
    <TileRow cols={3}>
      {(question.choices ?? []).map((c) => (
        <ChoiceTile key={c.id} choice={c} on={value === c.id} onClick={() => onChange(value === c.id ? undefined : c.id)} />
      ))}
    </TileRow>
  );
}

export function UrlsField({
  question,
  value,
  onChange,
}: {
  question: ClarificationQuestion;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const list = Array.isArray(value) ? value.map(String) : [];
  const [draft, setDraft] = useState("");
  const max = question.max ?? 3;
  const add = () => {
    const raw = draft.trim();
    if (!raw) return;
    onChange([...list, raw].slice(0, max));
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-2">
      {list.length ? (
        <div className="flex flex-wrap gap-1.5">
          {list.map((u, i) => (
            <span key={`${u}-${i}`} className="inline-flex min-h-[32px] items-center gap-1 rounded-full bg-muted px-2.5 text-[12.5px]">
              <span className="max-w-[200px] truncate">{u.replace(/^https?:\/\//, "")}</span>
              <button type="button" aria-label="Remove" onClick={() => onChange(list.filter((_, j) => j !== i))} className="rounded-full p-0.5 hover:bg-foreground/10">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {list.length < max ? (
        <div className="flex gap-2">
          <input
            className="min-h-[40px] flex-1 rounded-[10px] border border-border bg-input px-3 text-[13.5px] outline-none focus:border-foreground/30"
            placeholder={question.placeholder}
            inputMode="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" onClick={add} className="min-h-[40px] rounded-[10px] border border-border px-3 text-[13px] hover:bg-muted">
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function IdentityField({
  question,
  value,
  onChange,
  projectId,
  workspaceId,
  suggestedName,
}: {
  question: ClarificationQuestion;
  value: unknown;
  onChange: (next: unknown) => void;
  projectId?: string | null;
  workspaceId?: string | null;
  suggestedName?: string | null;
}) {
  const v: IdentityAnswer = value && typeof value === "object" ? (value as IdentityAnswer) : {};
  const fields = question.uploadFields ?? ["business_name", "logo", "favicon", "og_title", "og_description"];
  const logoInput = useRef<HTMLInputElement>(null);
  const favInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"logo" | "favicon" | null>(null);
  const [preview, setPreview] = useState<{ logo?: string; favicon?: string }>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const set = (patch: Partial<IdentityAnswer>) => {
    const next = { ...v, ...patch };
    for (const k of Object.keys(next) as Array<keyof IdentityAnswer>) if (!next[k]) delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  const inputClass =
    "min-h-[40px] w-full rounded-[10px] border border-border bg-input px-3 text-[13.5px] outline-none focus:border-foreground/30";

  const upload = async (role: "logo" | "favicon", file: File | undefined) => {
    if (!file || !projectId || !workspaceId) return;
    setBusy(role);
    setUploadError(null);
    try {
      const { uploadProjectAsset, fileToDataUrl } = await import("@/lib/api/project-assets-client");
      const local = await fileToDataUrl(file);
      const asset = await uploadProjectAsset({ projectId, workspaceId, file, role });
      if (!asset) {
        setUploadError("That image couldn’t be saved. Try a PNG, JPG or SVG under 10 MB.");
        return;
      }
      setPreview((p) => ({ ...p, [role]: local }));
      if (role === "logo") set({ logo_asset_id: asset.assetId, favicon_mode: v.favicon_mode ?? "logo" });
      else set({ favicon_asset_id: asset.assetId, favicon_mode: "upload" });
    } finally {
      setBusy(null);
    }
  };

  const renderUploadTile = (role: "logo" | "favicon", label: string) => {
    const img = preview[role];
    const has = role === "logo" ? Boolean(v.logo_asset_id) : Boolean(v.favicon_asset_id);
    const ref = role === "logo" ? logoInput : favInput;
    return (
      <button
        key={role}
        type="button"
        onClick={() => ref.current?.click()}
        className={cn(
          "relative flex min-h-[84px] flex-1 flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed text-[12.5px]",
          has ? "border-foreground/50 bg-muted/40" : "border-border hover:bg-muted/40",
        )}
      >
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
          className="hidden"
          onChange={(e) => void upload(role, e.target.files?.[0])}
        />
        {busy === role ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className={cn("object-contain", role === "logo" ? "max-h-9 max-w-[120px]" : "h-8 w-8 rounded-md")} />
        ) : (
          <ImagePlus className="h-5 w-5 text-muted-foreground" strokeWidth={1.6} />
        )}
        <span className="font-medium">{has ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {fields.includes("business_name") ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className={inputClass}
            placeholder={suggestedName ? `Business name (e.g. ${suggestedName})` : "Business name"}
            value={v.business_name ?? ""}
            onChange={(e) => set({ business_name: e.target.value })}
          />
          {fields.includes("tagline") ? (
            <input className={inputClass} placeholder="Tagline (optional)" value={v.tagline ?? ""} onChange={(e) => set({ tagline: e.target.value })} />
          ) : null}
        </div>
      ) : null}
      {fields.includes("logo") || fields.includes("favicon") ? (
        <div className="flex gap-2">
          {fields.includes("logo") ? renderUploadTile("logo", "Logo") : null}
          {fields.includes("favicon") ? renderUploadTile("favicon", "Favicon") : null}
        </div>
      ) : null}
      {fields.includes("favicon") ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
          <span>Favicon:</span>
          {(
            [
              ["logo", "From logo"],
              ["generate", "Generate for me"],
              ["upload", "Uploaded"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              disabled={mode === "upload" && !v.favicon_asset_id}
              onClick={() => set({ favicon_mode: mode })}
              className={cn(
                "min-h-[32px] rounded-full px-3 text-[12px] disabled:opacity-40",
                (v.favicon_mode ?? (v.logo_asset_id ? "logo" : "generate")) === mode ? "bg-foreground text-background" : "bg-muted text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {uploadError ? <p className="text-[12px] text-destructive">{uploadError}</p> : null}
      {fields.includes("og_title") || fields.includes("og_description") ? (
        <div className="flex flex-col gap-2 rounded-[12px] border border-border/70 bg-muted/30 p-3">
          <p className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">Link preview (when shared)</p>
          {fields.includes("og_title") ? (
            <input className={inputClass} placeholder="Title — defaults to business name" value={v.og_title ?? ""} onChange={(e) => set({ og_title: e.target.value })} />
          ) : null}
          {fields.includes("og_description") ? (
            <textarea
              className={cn(inputClass, "min-h-[60px] resize-y py-2")}
              placeholder="One sentence shown under the title — we’ll write one if you leave this blank."
              value={v.og_description ?? ""}
              onChange={(e) => set({ og_description: e.target.value })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
