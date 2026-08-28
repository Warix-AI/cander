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
import { NewBuildMenu } from "@/components/spaces/NewBuildMenu";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import {
  buildScopeOptions,
  taskMeta,
  workspaceAutomations,
  workspaceOneOffTasks,
  type BuildScope,
} from "@/lib/build-catalog";
import { useSpaceProjects } from "@/lib/hooks/use-space-query";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { MobileFilterBar } from "@/components/shell/mobile/MobilePanelActions";
import { useMobileShell } from "@/lib/use-media-query";

export function BuildDashboard() {
  const {
    workspaceId,
    openProject,
    openJob,
    openSkill,
    newChat,
    spaceLayout,
    setSpaceLayout,
    mobileSurface,
    view,
  } = useApp();
  const mobile = useMobileShell();
  const hoistFilters =
    mobile && view === "space" && mobileSurface === "panel";
  const [scope, setScope] = useState<BuildScope>("all");
  const { data: spaceProjects, loading: projectsLoading } =
    useSpaceProjects("build");

  const automations = useMemo(
    () => workspaceAutomations(workspaceId),
    [workspaceId],
  );
  const tasks = useMemo(
    () => workspaceOneOffTasks(workspaceId),
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
          <NewBuildMenu onCreated={openProject} />
          <DashBtn onClick={() => newChat("build")}>Ask</DashBtn>
          <SpaceSettingsButton space="build" />
        </>
      }
    >
      <MobileFilterBar
        active={hoistFilters}
        onNewChat={() => newChat("build")}
        scope={{
          value: scope,
          onChange: (value) => setScope(value as BuildScope),
          options: buildScopeOptions(),
        }}
        layout={{ value: spaceLayout, onChange: setSpaceLayout }}
      >
        <ScopeToggle
          wrap
          value={scope}
          onChange={(value) => setScope(value as BuildScope)}
          options={buildScopeOptions()}
        />
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </MobileFilterBar>

      <div className="mt-5">
        {scope === "projects" ? (
          projectsLoading ? (
            <QuerySkeleton rows={3} />
          ) : (
            <PreviewGrid
              layout={spaceLayout}
              items={spaceProjects.map((item) => ({
                id: item.id,
                name: item.title,
                projectId: item.id,
                meta: `Edited ${item.updatedAt}`,
                image: item.cover,
                badge:
                  item.status === "published" ? "Published" : undefined,
              }))}
              onOpen={openProject}
              empty="No projects yet. Create one to start building."
            />
          )
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
            items={spaceProjects.map((item) => ({
              id: item.id,
              name: item.title,
              projectId: item.id,
              meta: `Edited ${item.updatedAt}`,
              badge: item.status === "published" ? "Published" : undefined,
              image: item.cover,
            }))}
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
