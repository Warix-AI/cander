"use client";

import { useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashBtn,
  DashFrame,
  DashToolbar,
  LayoutToggle,
  useSpaceChatClosed,
} from "@/components/spaces/ItemSet";
import { WorkCollectionFilter } from "@/components/spaces/work/WorkCollectionFilter";
import { WorkSpaceView } from "@/components/spaces/work/WorkSpaceView";
import type { WorkCollectionCategory } from "@/lib/work-screen-data";
import { WORK_COLLECTION_CATEGORY_OPTIONS } from "@/lib/work-screen-data";
import { useMobileShell } from "@/lib/use-media-query";

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

  const [category, setCategory] = useState<"all" | WorkCollectionCategory>(
    "all",
  );

  return (
    <DashFrame
      banner={false}
      title="Work"
      subtitle="Organize apps, projects, assets, and connections."
    >
      <DashToolbar
        active={hoistFilters}
        onNewChat={
          chatClosed
            ? () => openSpaceChat("work", { landOnPanel: false })
            : undefined
        }
        newChatLabel="Ask"
        layout={{ value: spaceLayout, onChange: setSpaceLayout }}
        extras={WORK_COLLECTION_CATEGORY_OPTIONS.map((item) => ({
          id: item.id,
          label: item.label,
          active: category === item.id,
          onClick: () => setCategory(item.id),
        }))}
        actions={
          <>
            {chatClosed ? (
              <DashBtn
                onClick={() =>
                  openSpaceChat("work", { landOnPanel: false })
                }
              >
                Ask
              </DashBtn>
            ) : null}
            <WorkCollectionFilter value={category} onChange={setCategory} />
          </>
        }
      >
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </DashToolbar>

      <div className="mt-5">
        <WorkSpaceView
          layout={spaceLayout}
          category={category}
          onCategoryChange={setCategory}
        />
      </div>
    </DashFrame>
  );
}
