"use client";

import { useCallback, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashBtn,
  DashFrame,
  DashToolbar,
  LayoutToggle,
  ScopeToggle,
  useSpaceChatClosed,
} from "@/components/spaces/ItemSet";
import { WorkCollectionFilter } from "@/components/spaces/work/WorkCollectionFilter";
import { WorkSpaceView } from "@/components/spaces/work/WorkSpaceView";
import { WorkTodayView } from "@/components/spaces/work/WorkTodayView";
import type { WorkCollectionCategory } from "@/lib/work-screen-data";
import { WORK_COLLECTION_CATEGORY_OPTIONS } from "@/lib/work-screen-data";
import {
  readWorkScreenView,
  writeWorkScreenView,
  type WorkScreenView,
} from "@/lib/work-view-preference";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const WORK_VIEW_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "space", label: "Space" },
] as const;

export function WorkDashboard() {
  const {
    openSpaceChat,
    spaceLayout,
    setSpaceLayout,
    mobileSurface,
    view,
  } = useApp();
  const mobile = useMobileShell();
  const chatClosed = useSpaceChatClosed();
  const hoistFilters =
    mobile && view === "space" && mobileSurface === "panel";

  const [workView, setWorkViewState] = useState<WorkScreenView>(
    readWorkScreenView,
  );
  const [category, setCategory] = useState<"all" | WorkCollectionCategory>(
    "all",
  );

  const setWorkView = useCallback((next: WorkScreenView) => {
    setWorkViewState(next);
    writeWorkScreenView(next);
  }, []);

  const isSpace = workView === "space";

  return (
    <DashFrame
      banner={false}
      title="Work"
      subtitle="Plan your day and organize what you use."
    >
      <DashToolbar
        active={hoistFilters}
        onNewChat={
          chatClosed ? () => openSpaceChat("work", { landOnPanel: false }) : undefined
        }
        newChatLabel="Ask"
        scope={{
          value: workView,
          onChange: (id) => setWorkView(id as WorkScreenView),
          options: WORK_VIEW_OPTIONS.map((item) => ({
            id: item.id,
            label: item.label,
          })),
          label: "View",
        }}
        layout={
          isSpace
            ? { value: spaceLayout, onChange: setSpaceLayout }
            : undefined
        }
        extras={
          isSpace
            ? WORK_COLLECTION_CATEGORY_OPTIONS.map((item) => ({
                id: item.id,
                label: item.label,
                active: category === item.id,
                onClick: () => setCategory(item.id),
              }))
            : undefined
        }
        actions={
          <>
            {chatClosed ? (
              <DashBtn primary onClick={() => openSpaceChat("work", { landOnPanel: false })}>
                Ask
              </DashBtn>
            ) : null}
            {isSpace ? (
              <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
            ) : null}
          </>
        }
      >
        <div className={cn("flex shrink-0 items-center gap-2")}>
          <ScopeToggle
            value={workView}
            onChange={(id) => setWorkView(id as WorkScreenView)}
            options={[...WORK_VIEW_OPTIONS]}
          />
          {isSpace ? (
            <WorkCollectionFilter value={category} onChange={setCategory} />
          ) : null}
        </div>
      </DashToolbar>

      {isSpace ? (
        <div className="mt-7">
          <WorkSpaceView layout={spaceLayout} category={category} />
        </div>
      ) : (
        <div className="mt-7">
          <WorkTodayView />
        </div>
      )}
    </DashFrame>
  );
}
