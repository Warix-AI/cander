"use client";

import { useApp } from "@/components/app/AppProvider";
import { ItemSet, LayoutToggle } from "@/components/spaces/ItemSet";
import { projects, spaces } from "@/lib/data";

export function RecentsView() {
  const {
    workspaceId,
    threads,
    openThread,
    openProject,
    newChat,
    spaceLayout,
    setSpaceLayout,
  } = useApp();

  const items = [
    ...threads
      .filter((thread) => thread.workspaceId === workspaceId)
      .map((thread) => ({
        id: `t-${thread.id}`,
        title: thread.title,
        meta: [
          spaces.find((item) => item.id === thread.spaceId)?.label,
          thread.updatedAt,
        ]
          .filter(Boolean)
          .join(" · "),
        snippet: thread.snippet,
        onClick: () => openThread(thread.id),
      })),
    ...projects
      .filter((project) => project.workspaceId === workspaceId)
      .map((project) => ({
        id: `p-${project.id}`,
        title: project.name,
        meta: [
          spaces.find((item) => item.id === project.space)?.label,
          project.updatedAt,
        ]
          .filter(Boolean)
          .join(" · "),
        snippet: "Project",
        onClick: () => openProject(project.id),
      })),
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
              This workspace
            </p>
            <h1 className="heading-display mt-2 text-[1.85rem]">Recents</h1>
          </div>
          <div className="flex items-center gap-2">
            <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
            <button
              type="button"
              onClick={() => newChat()}
              className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-[13.5px] font-medium text-primary-foreground transition-colors duration-200 hover:bg-foreground"
            >
              New chat
            </button>
          </div>
        </div>

        <div className="mt-8">
          <ItemSet
            layout={spaceLayout}
            items={items}
            empty="Nothing recent in this workspace yet."
          />
        </div>
      </div>
    </div>
  );
}
