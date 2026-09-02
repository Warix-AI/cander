"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useApp } from "@/components/app/AppProvider";
import { LayoutToggle } from "@/components/spaces/ItemSet";
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
  scheduledJobs,
  skills,
} from "@/lib/data";
import {
  getInstalledConnectorsServerSnapshot,
  getInstalledConnectorsSnapshot,
  mergeConnectorInstalled,
  subscribeInstalledConnectors,
} from "@/lib/connector-install";
import { editedMeta } from "@/lib/format-relative-time";
import { projectsForWorkspace } from "@/lib/project-resolver";
import type { NavDestinationId, SpaceId } from "@/lib/types";
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
  const dest: NavDestinationId = spaceId ?? "build";
  useSyncExternalStore(
    subscribeInstalledConnectors,
    getInstalledConnectorsSnapshot,
    getInstalledConnectorsServerSnapshot,
  );

  const { kind, title, empty, onOpen, entries } = useMemo(() => {
    const projects = projectsForWorkspace(workspaceId);
    if (dest === "connectors") {
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
          mergeConnectorInstalled(item.id) ? "Installed" : item.category,
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
        "No connectors yet. Open a connector to connect an account.",
        openConnector,
        items,
        [...grouped.entries()].map(([name, groupItems]) => ({
          name,
          items: groupItems,
        })),
      );
    }

    const space = dest as SpaceId;

    if (space === "research") {
      const list = projects.filter(
        (item) => item.space === "research" && item.workspaceId === workspaceId,
      );
      const items = list.map((item) =>
        entry(item.id, item.name, item.id, editedMeta(item.updatedAt), "paper"),
      );
      return pack("paper", "Projects", "No Home projects yet. Create one to start searching.", openProject, items, items.map((item) => ({
        name: item.name,
        items: [item],
      })));
    }

    if (space === "studio") {
      const list = projects.filter(
        (item) => item.space === "studio" && item.workspaceId === workspaceId,
      );
      const items = list.map((item) =>
        entry(item.id, item.name, item.id, editedMeta(item.updatedAt), "paper"),
      );
      return pack(
        "paper",
        "Projects",
        "No Studio projects yet. Create one to open a browser.",
        openProject,
        items,
        items.map((item) => ({
          name: item.name,
          items: [item],
        })),
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
          editedMeta(item.updatedAt),
          "product",
          undefined,
          item.cover,
        ),
      );
      return pack(
        "product",
        "Work",
        "Nothing open in Work yet. Create a project to get started.",
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
          editedMeta(item.updatedAt),
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
    dest,
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
          "flex items-center justify-end gap-2 pb-3",
          mobile ? "px-4 pt-3" : "px-3",
        )}
      >
        <LayoutToggle
          compact
          layout={spaceLayout}
          onChange={setSpaceLayout}
        />
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto pb-4", mobile ? "px-4" : "px-3")}>
        <PreviewGrid
          dense
          layout={spaceLayout}
          kind={kind}
          items={entries}
          onOpen={handleOpen}
          empty={empty}
        />
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
