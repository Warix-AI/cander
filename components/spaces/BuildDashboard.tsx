"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  apiPreviews,
  keyPreviews,
  modelFilters,
  modelPreviews,
} from "@/components/platform/PlatformPreview";
import {
  DashBtn,
  DashFrame,
  LayoutToggle,
  ScopeToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import {
  buildCtaLabel,
  buildScopeOptions,
  filterPreviews,
  filterTasks,
  taskMeta,
  type BuildScope,
  type TaskCadence,
  workspaceTasks,
} from "@/lib/build-catalog";
import {
  getBuildRuntimeServerSnapshot,
  getBuildRuntimeSnapshot,
  setBuildModel,
  subscribeBuildRuntime,
} from "@/lib/build-runtime";
import { buildPreviews, spaceStats } from "@/lib/data";

export function BuildDashboard() {
  const {
    workspaceId,
    openProject,
    openJob,
    openSkill,
    newChat,
    spaceLayout,
    setSpaceLayout,
    entitlements,
  } = useApp();
  const [scope, setScope] = useState<BuildScope>("all");
  const [cadence, setCadence] = useState<TaskCadence>("all");
  const [runtime, setRuntime] = useState("all");
  const selectedModel = useSyncExternalStore(
    subscribeBuildRuntime,
    getBuildRuntimeSnapshot,
    getBuildRuntimeServerSnapshot,
  );

  const previews = buildPreviews.filter(
    (item) => item.workspaceId === workspaceId,
  );
  const meta = spaceStats.build;
  const tasks = useMemo(
    () => filterTasks(workspaceTasks(workspaceId), cadence),
    [workspaceId, cadence],
  );
  const filteredPreviews = filterPreviews(previews, scope);
  const models = useMemo(() => {
    const items = modelPreviews().map((item) => {
      const name = item.projectId.includes(":")
        ? item.projectId.slice(item.projectId.indexOf(":") + 1)
        : item.name;
      return {
        ...item,
        badge: selectedModel === name ? "Selected" : item.badge,
      };
    });
    if (runtime === "all") return items;
    return items.filter((item) => item.projectId.startsWith(`${runtime}:`));
  }, [runtime, selectedModel]);

  const openTask = (id: string) => {
    const task = workspaceTasks(workspaceId).find((item) => item.id === id);
    if (task?.open.kind === "job") openJob(task.open.id);
    else openSkill(task?.open.id ?? id);
  };

  return (
    <DashFrame
      space="build"
      kicker={meta.kicker}
      title="Build"
      subtitle="Apps, websites, and tasks — plus Platform APIs and keys for what you ship."
      actions={
        <>
          <SpaceSettingsButton space="build" />
          <DashBtn primary onClick={() => newChat("build")}>
            {buildCtaLabel(scope)}
          </DashBtn>
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ScopeToggle
            wrap
            value={scope}
            onChange={(value) => {
              if (value === "models" && !entitlements.hasModelChoice) {
                return;
              }
              setScope(value as BuildScope);
            }}
            options={buildScopeOptions().filter(
              (item) =>
                item.id !== "models" || entitlements.hasModelChoice,
            )}
          />
          {scope === "tasks" ? (
            <ScopeToggle
              value={cadence}
              onChange={(value) => setCadence(value as TaskCadence)}
              options={[
                { id: "all", label: "All" },
                { id: "recurring", label: "Recurring" },
                { id: "once", label: "One-off" },
              ]}
            />
          ) : null}
          {scope === "models" ? (
            <ScopeToggle
              value={runtime}
              onChange={setRuntime}
              options={modelFilters()}
            />
          ) : null}
        </div>
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </div>

      <div className="mt-5">
        {scope === "tasks" ? (
          <PreviewGrid
            layout={spaceLayout}
            kind="skill"
            items={tasks.map((item) => ({
              id: item.id,
              name: item.name,
              projectId: item.id,
              meta: taskMeta(item),
              detail: item.nextRun ?? item.schedule,
              badge: item.cadence === "recurring" ? "Recurring" : "One-off",
            }))}
            onOpen={openTask}
            empty="No tasks yet."
          />
        ) : scope === "apis" ? (
          <PreviewGrid
            layout={spaceLayout}
            kind="skill"
            items={apiPreviews()}
            onOpen={() => newChat("build")}
            empty="No APIs yet."
          />
        ) : scope === "keys" ? (
          <PreviewGrid
            layout={spaceLayout}
            kind="file"
            items={keyPreviews()}
            onOpen={(hint) => {
              void navigator.clipboard.writeText(hint);
            }}
            empty="No keys yet."
          />
        ) : scope === "models" ? (
          <PreviewGrid
            layout={spaceLayout}
            items={models}
            onOpen={(id) => {
              const name = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
              setBuildModel(name);
            }}
            empty="No models in this filter."
          />
        ) : (
          <PreviewGrid
            layout={spaceLayout}
            items={filteredPreviews.map(toEntry)}
            onOpen={openProject}
            empty="No previews yet."
          />
        )}
      </div>
    </DashFrame>
  );
}

function toEntry(item: (typeof buildPreviews)[number]) {
  return {
    id: item.id,
    name: item.name,
    projectId: item.projectId,
    meta: `Edited ${item.updatedAt}`,
    badge: item.published ? "Published" : undefined,
    image: item.image,
  };
}
