"use client";

import { useApp } from "@/components/app/AppProvider";
import { Row, SectionLabel } from "@/components/panels/Bits";
import { spaces } from "@/lib/data";

export function SharedPanel() {
  const { threads, openThread } = useApp();
  const shared = threads.filter((thread) => thread.shared);

  return (
    <div className="p-3 pt-4">
      <SectionLabel>Visible to the workspace</SectionLabel>
      {shared.length ? (
        shared.map((thread) => (
          <Row
            key={thread.id}
            title={thread.title}
            meta={spaces.find((s) => s.id === thread.spaceId)?.label}
            onClick={() => openThread(thread.id)}
          />
        ))
      ) : (
        <p className="px-3 py-6 text-[13px] text-muted-foreground">
          Nothing shared yet.
        </p>
      )}
    </div>
  );
}
