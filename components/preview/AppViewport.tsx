"use client";

import { useApp } from "@/components/app/AppProvider";
import { BannerWash } from "@/components/spaces/BannerWash";
import { buildPreviews } from "@/lib/data";
import type { BannerKey } from "@/lib/space-banners";
import type { PreviewNodeId } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AppViewport({
  name,
  summary,
}: {
  name: string;
  summary: string;
}) {
  const {
    viewport,
    selectMode,
    selectedId,
    setHoveredId,
    selectElement,
    previewKey,
    project,
    spaceId,
  } = useApp();

  const framed = viewport !== "desktop";
  const cover =
    project?.cover ??
    buildPreviews.find((item) => item.projectId === project?.id)?.image;
  const washSpace: BannerKey =
    (project?.space as BannerKey | undefined) ??
    (spaceId as BannerKey | null) ??
    "build";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 justify-center",
        framed ? "items-center bg-white p-4 dark:bg-muted/40" : "items-stretch",
      )}
    >
      <div
        key={previewKey}
        className={cn(
          "relative overflow-hidden",
          viewport === "desktop" && "h-full min-h-0 w-full rounded-none",
          viewport === "tablet" &&
            "h-full w-auto max-w-full aspect-[3/4] rounded-[10px] shadow-[0_16px_40px_rgba(0,0,0,0.28)]",
          viewport === "mobile" &&
            "h-full w-auto max-w-full aspect-[9/19.5] rounded-[18px] shadow-[0_16px_40px_rgba(0,0,0,0.28)]",
        )}
      >
        {cover ? (
          <img
            src={cover}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
        ) : (
          <>
            <BannerWash space={washSpace} />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-6 text-[12px] text-white/80">
              <PreviewHit
                id="nav"
                selectMode={selectMode}
                selected={selectedId}
                onHover={setHoveredId}
                onSelect={selectElement}
              >
                <span className="font-medium tracking-[-0.02em]">{name}</span>
              </PreviewHit>
              <PreviewHit
                id="cta"
                selectMode={selectMode}
                selected={selectedId}
                onHover={setHoveredId}
                onSelect={selectElement}
              >
                <span className="inline-flex rounded-full border border-white/25 px-3 py-1 text-[11px]">
                  Get started
                </span>
              </PreviewHit>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-8 text-white md:p-10">
              <PreviewHit
                id="kicker"
                selectMode={selectMode}
                selected={selectedId}
                onHover={setHoveredId}
                onSelect={selectElement}
              >
                <p className="font-mono text-[11px] tracking-[0.08em] text-white/70 uppercase">
                  localhost
                </p>
              </PreviewHit>
              <PreviewHit
                id="heading"
                selectMode={selectMode}
                selected={selectedId}
                onHover={setHoveredId}
                onSelect={selectElement}
              >
                <p className="mt-3 text-[2rem] font-semibold tracking-[-0.04em] md:text-[2.4rem]">
                  {name}
                </p>
              </PreviewHit>
              <PreviewHit
                id="body"
                selectMode={selectMode}
                selected={selectedId}
                onHover={setHoveredId}
                onSelect={selectElement}
              >
                <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-white/75">
                  {summary}
                </p>
              </PreviewHit>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PreviewHit({
  id,
  selectMode,
  selected,
  onHover,
  onSelect,
  children,
}: {
  id: PreviewNodeId;
  selectMode: boolean;
  selected: PreviewNodeId | null;
  onHover: (id: PreviewNodeId | null) => void;
  onSelect: (id: PreviewNodeId) => void;
  children: React.ReactNode;
}) {
  const active = selected === id;
  return (
    <div
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(id);
      }}
      className={cn(
        "cursor-pointer rounded-[6px] transition-[outline] duration-150",
        "hover:outline hover:outline-1 hover:outline-offset-2 hover:outline-white/55",
        selectMode && "hover:outline-white/80",
        active && "outline outline-2 outline-offset-2 outline-white",
      )}
    >
      {children}
    </div>
  );
}
