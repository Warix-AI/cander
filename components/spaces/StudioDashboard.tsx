"use client";

import { useMemo, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashFrame,
  LayoutToggle,
  Pill,
  ScopeToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import { assetFiles as seedFiles, projects, spaceStats } from "@/lib/data";
import type { AssetFile } from "@/lib/types";

type StudioScope = "all" | "projects" | "assets";

export function StudioDashboard() {
  const {
    workspaceId,
    openProject,
    openFile,
    newChat,
    spaceLayout,
    setSpaceLayout,
  } = useApp();
  const [scope, setScope] = useState<StudioScope>("all");
  const [localFiles, setLocalFiles] = useState<AssetFile[]>([]);
  const meta = spaceStats.studio;

  const spaceProjects = projects.filter(
    (item) => item.space === "studio" && item.workspaceId === workspaceId,
  );
  const files = useMemo(
    () => [
      ...localFiles,
      ...seedFiles.filter((item) => item.workspaceId === workspaceId),
    ],
    [localFiles, workspaceId],
  );

  const upload = () => {
    const id = `af-${Math.random().toString(36).slice(2, 7)}`;
    const next: AssetFile = {
      id,
      name: "Untitled.png",
      kind: "image",
      ext: "PNG",
      size: "12 KB",
      source: "studio",
      workspaceId,
      updatedAt: "Just now",
    };
    setLocalFiles((current) => [next, ...current]);
    setScope("assets");
    openFile(id);
  };

  return (
    <DashFrame
      space="studio"
      kicker={meta.kicker}
      title="Studio"
      subtitle="Stills, video, decks, and the assets that come with them."
      actions={
        <>
          <SpaceSettingsButton space="studio" />
          {scope === "assets" ? (
            <Pill primary onClick={upload}>
              <span className="inline-flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" strokeWidth={1.6} />
                Upload
              </span>
            </Pill>
          ) : (
            <Pill primary onClick={() => newChat("studio")}>
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
                New project
              </span>
            </Pill>
          )}
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScopeToggle
          value={scope}
          onChange={(value) => setScope(value as StudioScope)}
          options={[
            { id: "all", label: "All" },
            { id: "projects", label: "Projects" },
            { id: "assets", label: "Assets" },
          ]}
        />
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </div>

      <div className="mt-5">
        {scope === "projects" ? (
          <PreviewGrid
            layout={spaceLayout}
            items={spaceProjects.map(projectEntry)}
            onOpen={openProject}
            empty="No Studio projects yet."
          />
        ) : scope === "assets" ? (
          <PreviewGrid
            layout={spaceLayout}
            kind="file"
            items={files.map(fileEntry)}
            onOpen={openFile}
            empty="No assets yet."
          />
        ) : (
          <PreviewGrid
            layout={spaceLayout}
            items={[
              ...spaceProjects.map((item) => ({
                ...projectEntry(item),
                meta: `Project · edited ${item.updatedAt}`,
              })),
              ...files.map(fileEntry),
            ]}
            onOpen={(id) => {
              if (spaceProjects.some((item) => item.id === id)) openProject(id);
              else openFile(id);
            }}
            empty="Nothing in Studio yet."
          />
        )}
      </div>
    </DashFrame>
  );
}

function projectEntry(item: (typeof projects)[number]) {
  return {
    id: item.id,
    name: item.name,
    projectId: item.id,
    meta: `Edited ${item.updatedAt}`,
    image: item.cover,
    kind: "product" as const,
  };
}

function fileEntry(item: AssetFile) {
  return {
    id: item.id,
    name: item.name,
    projectId: item.id,
    meta: `${item.size} · ${item.source}`,
    detail: item.ext,
    kind: "file" as const,
  };
}
