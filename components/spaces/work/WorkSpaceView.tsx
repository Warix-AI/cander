"use client";

import { useMemo } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  SPACE_EMPTY_COPY,
  SpaceEmptyCard,
} from "@/components/spaces/SpaceEmptyCard";
import { WorkCollectionGrid } from "@/components/spaces/work/WorkCollectionGrid";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { useSpaceAttachments } from "@/lib/hooks/use-space-query";
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
  onCategoryChange?: (next: "all" | WorkCollectionCategory) => void;
}) {
  const { openWorkItem, openSpace } = useApp();
  const { data: attachments, loading: attachmentsLoading } =
    useSpaceAttachments();

  const starting = !attachmentsLoading && attachments.length === 0;

  const items = useMemo(
    () =>
      WORK_COLLECTION_ITEMS.filter(
        (item) => category === "all" || item.category === category,
      ),
    [category],
  );

  const copy = SPACE_EMPTY_COPY.work;

  const emptyCard = (
    <SpaceEmptyCard
      space="work"
      title={copy.title}
      description={copy.description}
      actionLabel={copy.actionLabel}
      onAction={() => openSpace("connectors")}
    />
  );

  if (attachmentsLoading) {
    return <QuerySkeleton rows={2} />;
  }

  // Fresh Work space — show the same inviting empty card as other spaces.
  if (starting) {
    return (
      <div className="w-full pt-2 pb-8">
        {emptyCard}
      </div>
    );
  }

  return (
    <WorkCollectionGrid
      layout={layout}
      items={items}
      onOpen={openWorkItem}
      empty={emptyCard}
    />
  );
}
