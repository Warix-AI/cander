"use client";

import { useMemo } from "react";
import { useApp } from "@/components/app/AppProvider";
import { WorkCollectionGrid } from "@/components/spaces/work/WorkCollectionGrid";
import {
  WORK_COLLECTION_ITEMS,
  type WorkCollectionCategory,
} from "@/lib/work-screen-data";
import type { SpaceLayout } from "@/lib/types";

export function WorkSpaceView({
  layout,
  category,
}: {
  layout: SpaceLayout;
  category: "all" | WorkCollectionCategory;
}) {
  const { openWorkItem } = useApp();
  const items = useMemo(
    () =>
      WORK_COLLECTION_ITEMS.filter(
        (item) => category === "all" || item.category === category,
      ),
    [category],
  );

  return (
    <WorkCollectionGrid layout={layout} items={items} onOpen={openWorkItem} />
  );
}
