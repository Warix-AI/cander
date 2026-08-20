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
import { assetFiles as seedFiles, projects } from "@/lib/data";
import type { AssetFile, AssetKind } from "@/lib/types";

type StudioScope = "all" | "projects" | "photos" | "videos" | "files";

const scopes: { id: StudioScope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "projects", label: "Projects" },
  { id: "photos", label: "Photos" },
  { id: "videos", label: "Videos" },
  { id: "files", label: "Files" },
];

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

  const spaceProjects = projects.filter(
    (item) => item.space === "studio" && item.workspaceId === workspaceId,
  );
  const library = useMemo(
    () =>
      [
        ...localFiles,
        ...seedFiles.filter((item) => item.workspaceId === workspaceId),
      ].filter(isStudioLibrary),
    [localFiles, workspaceId],
  );
  const scopedFiles = library.filter((item) => matchesScope(item, scope));
  const libraryScope = scope === "photos" || scope === "videos" || scope === "files";

  const upload = () => {
    const draft = draftFor(scope);
    const id = `af-${Math.random().toString(36).slice(2, 7)}`;
    const next: AssetFile = {
      id,
      name: draft.name,
      kind: draft.kind,
      ext: draft.ext,
      size: "12 KB",
      source: "studio",
      workspaceId,
      updatedAt: "Just now",
    };
    setLocalFiles((current) => [next, ...current]);
    if (!libraryScope) setScope(draft.scope);
    openFile(id);
  };

  return (
    <DashFrame
      space="studio"
      title="Studio"
      subtitle="Create photos, videos, and project files here together."
      actions={
        <>
          {libraryScope ? (
            <DashBtn primary onClick={upload}>
              Upload
            </DashBtn>
          ) : (
            <DashBtn primary onClick={() => newChat("studio")}>
              New chat
            </DashBtn>
          )}
          <SpaceSettingsButton space="studio" />
        </>
      }
    >
      <div className="flex flex-col gap-3 @min-[420px]:flex-row @min-[420px]:flex-wrap @min-[420px]:items-center @min-[420px]:justify-between">
        <ScopeToggle
          wrap
          value={scope}
          onChange={(value) => setScope(value as StudioScope)}
          options={scopes}
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
        ) : scope === "all" ? (
          <PreviewGrid
            layout={spaceLayout}
            items={[
              ...spaceProjects.map((item) => ({
                ...projectEntry(item),
                meta: `Project · edited ${item.updatedAt}`,
              })),
              ...library.map(fileEntry),
            ]}
            onOpen={(id) => {
              if (spaceProjects.some((item) => item.id === id)) openProject(id);
              else openFile(id);
            }}
            empty="Nothing in Studio yet."
          />
        ) : (
          <PreviewGrid
            layout={spaceLayout}
            kind="file"
            items={scopedFiles.map(fileEntry)}
            onOpen={openFile}
            empty={emptyFor(scope)}
          />
        )}
      </div>
    </DashFrame>
  );
}

function isStudioLibrary(item: AssetFile) {
  if (item.source === "studio") return true;
  return item.kind === "image" || item.kind === "media";
}

function matchesScope(item: AssetFile, scope: StudioScope) {
  if (scope === "photos") return item.kind === "image";
  if (scope === "videos") return item.kind === "media";
  if (scope === "files") {
    return (
      item.kind === "document" ||
      item.kind === "folder" ||
      item.kind === "data"
    );
  }
  return true;
}

function draftFor(scope: StudioScope): {
  name: string;
  kind: AssetKind;
  ext: string;
  scope: "photos" | "videos" | "files";
} {
  if (scope === "videos") {
    return { name: "Untitled.mp4", kind: "media", ext: "MP4", scope: "videos" };
  }
  if (scope === "files") {
    return {
      name: "Untitled.pdf",
      kind: "document",
      ext: "PDF",
      scope: "files",
    };
  }
  return { name: "Untitled.png", kind: "image", ext: "PNG", scope: "photos" };
}

function emptyFor(scope: StudioScope) {
  if (scope === "photos") return "No photos yet.";
  if (scope === "videos") return "No videos yet.";
  if (scope === "files") return "No files yet.";
  return "Nothing in Studio yet.";
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
  const visual = item.kind === "image" || item.kind === "media";
  return {
    id: item.id,
    name: item.name,
    projectId: item.id,
    meta: `${labelFor(item.kind)} · ${item.size}`,
    detail: item.ext,
    image: item.cover,
    kind: visual ? ("product" as const) : ("file" as const),
  };
}

function labelFor(kind: AssetKind) {
  if (kind === "image") return "Photo";
  if (kind === "media") return "Video";
  if (kind === "folder") return "Folder";
  if (kind === "document") return "File";
  if (kind === "data") return "File";
  return "File";
}
