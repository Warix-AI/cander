"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashBtn,
  DashFrame,
  LayoutToggle,
  ScopeToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import { StatsBanner } from "@/components/spaces/StatsBanner";
import { assetFiles as seed, projects, spaceStats } from "@/lib/data";
import type { AssetFile, AssetKind } from "@/lib/types";

const filters: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "document", label: "Documents" },
  { id: "code", label: "Code" },
  { id: "media", label: "Media" },
];

export function FilesLibrary({
  compact = false,
  hideChrome = false,
}: {
  compact?: boolean;
  hideChrome?: boolean;
}) {
  const { workspaceId, fileId, openFile, spaceLayout, setSpaceLayout } =
    useApp();
  const [local, setLocal] = useState<AssetFile[]>([]);
  const [scope, setScope] = useState("all");

  const all = useMemo(
    () => [
      ...local,
      ...seed.filter((item) => item.workspaceId === workspaceId),
    ],
    [local, workspaceId],
  );
  const visible =
    scope === "all" ? all : all.filter((item) => item.kind === (scope as AssetKind));
  const names = new Map(projects.map((item) => [item.id, item.name]));
  const selected = all.find((item) => item.id === fileId);

  const addFile = (kind: AssetKind, ext: string, name: string) => {
    const id = `af-${Math.random().toString(36).slice(2, 7)}`;
    const next: AssetFile = {
      id,
      name,
      kind,
      ext,
      size: kind === "folder" ? "Empty" : "12 KB",
      source: "files",
      workspaceId,
      updatedAt: "Just now",
    };
    setLocal((current) => [next, ...current]);
    openFile(id);
  };

  return (
    <div className={compact || hideChrome ? "" : "mt-4"}>
      {!compact && !hideChrome ? (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <DashBtn
            onClick={() => addFile("folder", "Folder", "Untitled folder")}
          >
            New folder
          </DashBtn>
          <DashBtn
            primary
            onClick={() => addFile("document", "PDF", "Untitled.pdf")}
          >
            Upload
          </DashBtn>
        </div>
      ) : null}

      {selected && !compact && !hideChrome ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium tracking-[-0.02em]">
              {selected.name}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {selected.ext} · {selected.size} · from {selected.source}
              {selected.projectId
                ? ` · ${names.get(selected.projectId) ?? selected.projectId}`
                : ""}
            </p>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            Edited {selected.updatedAt}
          </p>
        </div>
      ) : null}

      {!hideChrome ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ScopeToggle value={scope} onChange={setScope} options={filters} />
          <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
        </div>
      ) : null}

      <div className={hideChrome ? "" : "mt-4"}>
        <PreviewGrid
          layout={spaceLayout}
          kind="file"
          items={visible.map((item) => ({
            id: item.id,
            name: item.name,
            projectId: item.id,
            meta: `${item.size} · ${item.source}`,
            detail: item.ext,
            badge: item.kind === "folder" ? "Folder" : undefined,
          }))}
          onOpen={openFile}
          empty="No assets in this workspace yet."
        />
      </div>
    </div>
  );
}

export function FilesDashboard() {
  const meta = spaceStats.files;

  return (
    <DashFrame
      space="files"
      banner={false}
      kicker={meta.kicker}
      title="Files"
      actions={<SpaceSettingsButton space="files" />}
    >
      <StatsBanner stats={meta.stats} />
      <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
        Previews, stills, briefs, and code Courier generated across Build,
        Studio, and Research — one library.
      </p>
      <FilesLibrary />
    </DashFrame>
  );
}
