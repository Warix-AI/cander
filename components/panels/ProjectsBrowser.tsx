"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { LayoutToggle, ScopeToggle } from "@/components/spaces/ItemSet";
import { PanelToggle } from "@/components/shell/PanelToggle";
import { useMobileShell } from "@/lib/use-media-query";
import {
  PreviewGrid,
  type PreviewEntry,
  type PreviewKind,
} from "@/components/spaces/PreviewCard";
import {
  assetFiles,
  buildPreviews,
  connectors,
  projects,
  scheduledJobs,
  skills,
} from "@/lib/data";
import type { SpaceId } from "@/lib/types";
import { blockedConnectorIds } from "@/lib/workspace-policy";
import { SHELL_PANEL_BODY } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

export function ProjectsBrowser({
  title: titleOverride,
  onOpen: onOpenOverride,
}: {
  title?: string;
  onOpen?: (id: string) => void;
} = {}) {
  const {
    spaceId,
    workspaceId,
    workspacePolicies,
    spaceLayout,
    setSpaceLayout,
    openProject,
    openSkill,
    openFile,
    openJob,
    openConnector,
    billingPlan,
  } = useApp();
  const mobile = useMobileShell();
  const [scope, setScope] = useState("all");
  const space: SpaceId = spaceId ?? "build";

  const { kind, title, empty, onOpen, entries, groups } = useMemo(() => {
    if (space === "studio") {
      const list = projects.filter(
        (item) => item.space === "studio" && item.workspaceId === workspaceId,
      );
      const items = list.map((item) =>
        entry(
          item.id,
          item.name,
          item.id,
          `Edited ${item.updatedAt}`,
          "product",
          undefined,
          item.cover,
        ),
      );
      return pack("product", "Projects", "No Studio projects yet.", openProject, items, items.map((item) => ({
        name: item.name,
        items: [item],
      })));
    }

    if (space === "research") {
      const list = projects.filter(
        (item) => item.space === "research" && item.workspaceId === workspaceId,
      );
      const items = list.map((item) =>
        entry(item.id, item.name, item.id, `Edited ${item.updatedAt}`, "paper"),
      );
      return pack("paper", "Projects", "No Research projects yet.", openProject, items, items.map((item) => ({
        name: item.name,
        items: [item],
      })));
    }

    if (space === "skills") {
      const list = skills.filter((item) => item.workspaceId === workspaceId);
      const items = list.map((item) =>
        entry(item.id, item.name, item.id, item.updatedAt, "skill"),
      );
      return pack("skill", "Tasks", "No tasks yet.", openSkill, items, [
        {
          name: "AI drafted",
          items: items.filter((_, i) => list[i]?.source === "ai"),
        },
        {
          name: "Custom",
          items: items.filter((_, i) => list[i]?.source === "custom"),
        },
      ]);
    }

    if (space === "files") {
      const list = assetFiles.filter((item) => item.workspaceId === workspaceId);
      const names = new Map(projects.map((item) => [item.id, item.name]));
      const items = list.map((item) =>
        entry(
          item.id,
          item.name,
          item.id,
          item.updatedAt,
          "file",
          item.projectId ? names.get(item.projectId) : undefined,
        ),
      );
      const grouped = new Map<string, PreviewEntry[]>();
      for (const item of list) {
        const label = item.projectId
          ? (names.get(item.projectId) ?? "Files")
          : "Library";
        const current = grouped.get(label) ?? [];
        current.push(
          items.find((entryItem) => entryItem.id === item.id) as PreviewEntry,
        );
        grouped.set(label, current);
      }
      return pack(
        "file",
        "Files",
        "No files yet.",
        openFile,
        items,
        [...grouped.entries()].map(([name, groupItems]) => ({
          name,
          items: groupItems,
        })),
      );
    }

    if (space === "connectors") {
      const blocked = blockedConnectorIds(
        workspaceId,
        workspacePolicies,
        billingPlan,
      );
      const list = connectors.filter((item) => !blocked.includes(item.id));
      const items = list.map((item) =>
        entry(
          item.id,
          item.name,
          item.id,
          item.installed ? "Installed" : item.category,
        ),
      );
      const grouped = new Map<string, PreviewEntry[]>();
      for (const item of list) {
        const current = grouped.get(item.category) ?? [];
        current.push(items.find((entryItem) => entryItem.id === item.id) as PreviewEntry);
        grouped.set(item.category, current);
      }
      return pack(
        "product",
        "Connectors",
        "No connectors yet.",
        openConnector,
        items,
        [...grouped.entries()].map(([name, groupItems]) => ({
          name,
          items: groupItems,
        })),
      );
    }

    if (space === "scheduled") {
      const list = scheduledJobs.filter((item) => item.workspaceId === workspaceId);
      const items = list.map((item) =>
        entry(item.id, item.name, item.id, item.schedule, "schedule", item.nextRun),
      );
      return pack("schedule", "Runs", "No scheduled runs yet.", openJob, items, [
        { name: "Upcoming", items },
      ]);
    }

    if (space === "finances" || space === "health") {
      const list = projects.filter(
        (item) => item.space === space && item.workspaceId === workspaceId,
      );
      const items = list.map((item) =>
        entry(
          item.id,
          item.name,
          item.id,
          `Edited ${item.updatedAt}`,
          "product",
          undefined,
          item.cover,
        ),
      );
      const title = space === "finances" ? "Finances" : "Health";
      return pack(
        "product",
        "Projects",
        `No ${title.toLowerCase()} projects yet.`,
        openProject,
        items,
        items.map((item) => ({ name: item.name, items: [item] })),
      );
    }

    if (space === "work") {
      const list = projects.filter(
        (item) => item.space === "work" && item.workspaceId === workspaceId,
      );
      const items = list.map((item) =>
        entry(
          item.id,
          item.name,
          item.id,
          `Edited ${item.updatedAt}`,
          "product",
          undefined,
          item.cover,
        ),
      );
      return pack(
        "product",
        "Work",
        "Nothing open in Work yet.",
        openProject,
        items,
        items.map((item) => ({ name: item.name, items: [item] })),
      );
    }

    if (space === "personal") {
      const list = projects.filter(
        (item) =>
          item.workspaceId === workspaceId &&
          (item.space === "personal" ||
            item.space === "finances" ||
            item.space === "health"),
      );
      const items = list.map((item) =>
        entry(
          item.id,
          item.name,
          item.id,
          `Edited ${item.updatedAt}`,
          "product",
          undefined,
          item.cover,
        ),
      );
      return pack(
        "product",
        "Personal",
        "Nothing open in Personal yet.",
        openProject,
        items,
        items.map((item) => ({ name: item.name, items: [item] })),
      );
    }

    if (space === "build") {
      const previews = buildPreviews.filter(
        (item) => item.workspaceId === workspaceId,
      );
      const names = new Map(projects.map((item) => [item.id, item.name]));
      const items = previews.map((item) =>
        entry(
          item.id,
          item.name,
          item.projectId,
          `Edited ${item.updatedAt}`,
          "product",
          item.published ? "Published" : undefined,
          item.image,
        ),
      );
      const grouped: { name: string; items: PreviewEntry[] }[] = [];
      for (const preview of previews) {
        const label = names.get(preview.projectId) ?? preview.name;
        const current = grouped.find((group) => group.name === label);
        const mapped = items.find((item) => item.id === preview.id) as PreviewEntry;
        if (current) current.items.push(mapped);
        else grouped.push({ name: label, items: [mapped] });
      }
      return pack(
        "product",
        "Projects",
        "No Build projects in this workspace.",
        openProject,
        items,
        grouped,
      );
    }

    return pack(
      "product",
      "Projects",
      "Nothing here yet.",
      openProject,
      [],
      [],
    );
  }, [
    space,
    workspaceId,
    workspacePolicies,
    openProject,
    openSkill,
    openFile,
    openJob,
    openConnector,
    billingPlan,
  ]);

  const projectLabel = titleOverride ?? (title === "Projects" ? "Projects" : title);
  const handleOpen = onOpenOverride ?? onOpen;

  return (
    <div className={SHELL_PANEL_BODY}>
      {mobile ? null : (
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          <p className="min-w-0 flex-1 truncate text-[14px] font-medium tracking-[-0.02em]">
            {projectLabel}
          </p>
          <PanelToggle />
        </div>
      )}
      <div
        className={cn(
          "flex items-center justify-between gap-2 pb-3",
          mobile ? "px-4 pt-3" : "px-3",
        )}
      >
        <ScopeToggle
          compact
          value={scope}
          onChange={setScope}
          options={[
            { id: "all", label: "All" },
            { id: "projects", label: "Projects" },
          ]}
        />
        <LayoutToggle
          compact
          layout={spaceLayout}
          onChange={setSpaceLayout}
        />
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto pb-4", mobile ? "px-4" : "px-3")}>
        {scope === "all" ? (
          <PreviewGrid
            dense
            layout={spaceLayout}
            kind={kind}
            items={entries}
            onOpen={handleOpen}
            empty={empty}
          />
        ) : (
          <div className="space-y-6">
            {groups
              .filter((group) => group.items.length)
              .map((group) => (
                <div key={group.name}>
                  <p className="mb-3 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                    {group.name}
                  </p>
                  <PreviewGrid
                    dense
                    layout={spaceLayout}
                    kind={kind}
                    items={group.items}
                    onOpen={handleOpen}
                    empty={empty}
                  />
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function entry(
  id: string,
  name: string,
  projectId: string,
  meta: string,
  kind?: PreviewKind,
  extra?: string,
  image?: string,
): PreviewEntry {
  return {
    id,
    name,
    projectId,
    meta,
    kind,
    badge: extra && kind !== "schedule" && extra === "Published" ? extra : undefined,
    detail: kind === "schedule" ? extra : undefined,
    image,
  };
}

function pack(
  kind: PreviewKind,
  title: string,
  empty: string,
  onOpen: (id: string) => void,
  entries: PreviewEntry[],
  groups: { name: string; items: PreviewEntry[] }[],
) {
  return { kind, title, empty, onOpen, entries, groups };
}
