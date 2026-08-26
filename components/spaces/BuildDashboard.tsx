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
import {
  buildScopeOptions,
  filterPreviews,
  taskMeta,
  workspaceAutomations,
  workspaceOneOffTasks,
  type BuildScope,
} from "@/lib/build-catalog";
import { buildPreviews, projects } from "@/lib/data";
import { projectsInSpace } from "@/lib/selectors";

export function BuildDashboard() {
  const {
    workspaceId,
    openProject,
    openJob,
    openSkill,
    newChat,
    spaceLayout,
    setSpaceLayout,
  } = useApp();
  const [scope, setScope] = useState<BuildScope>("all");

  const previews = buildPreviews.filter(
    (item) => item.workspaceId === workspaceId,
  );
  const automations = useMemo(
    () => workspaceAutomations(workspaceId),
    [workspaceId],
  );
  const tasks = useMemo(
    () => workspaceOneOffTasks(workspaceId),
    [workspaceId],
  );
  const filteredPreviews = filterPreviews(previews, scope);
  const spaceProjects = useMemo(
    () => projectsInSpace(projects, { space: "build", workspaceId }),
    [workspaceId],
  );

  const openTask = (id: string) => {
    const task =
      automations.find((item) => item.id === id) ??
      tasks.find((item) => item.id === id);
    if (task?.open.kind === "job") openJob(task.open.id);
    else openSkill(task?.open.id ?? id);
  };

  return (
    <DashFrame
      space="build"
      title="Build"
      subtitle="Ship apps, websites, automations, and your recurring tasks."
      actions={
        <>
          <DashBtn primary onClick={() => newChat("build")}>
            Ask
          </DashBtn>
          <SpaceSettingsButton space="build" />
        </>
      }
    >
      <div className="flex flex-col gap-3 @min-[420px]:flex-row @min-[420px]:flex-wrap @min-[420px]:items-center @min-[420px]:justify-between">
        <ScopeToggle
          wrap
          value={scope}
          onChange={(value) => setScope(value as BuildScope)}
          options={buildScopeOptions()}
        />
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </div>

      <div className="mt-5">
        {scope === "projects" ? (
          <PreviewGrid
            layout={spaceLayout}
            items={spaceProjects.map((item) => ({
              id: item.id,
              name: item.name,
              projectId: item.id,
              meta: `Edited ${item.updatedAt}`,
              image: item.cover,
            }))}
            onOpen={openProject}
            empty="No projects yet."
          />
        ) : scope === "automations" ? (
          <PreviewGrid
            layout={spaceLayout}
            kind="schedule"
            items={automations.map((item) => ({
              id: item.id,
              name: item.name,
              projectId: item.id,
              meta: taskMeta(item),
              detail: item.nextRun ?? item.schedule,
              badge: "Automation",
            }))}
            onOpen={openTask}
            empty="No automations yet."
          />
        ) : scope === "tasks" ? (
          <PreviewGrid
            layout={spaceLayout}
            kind="skill"
            items={tasks.map((item) => ({
              id: item.id,
              name: item.name,
              projectId: item.id,
              meta: taskMeta(item),
              detail: item.summary,
              badge: "Task",
            }))}
            onOpen={openTask}
            empty="No tasks yet."
          />
        ) : (
          <PreviewGrid
            layout={spaceLayout}
            items={filteredPreviews.map(toEntry)}
            onOpen={openProject}
            empty={
              scope === "apps"
                ? "No apps yet."
                : scope === "websites"
                  ? "No websites yet."
                  : "No builds yet."
            }
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
