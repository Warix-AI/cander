"use client";

import { useApp } from "@/components/app/AppProvider";
import {
  isExtraNavId,
  resolveSidebarNav,
  type SidebarNavId,
} from "@/lib/spaces";
import { memberSpaces } from "@/lib/workspace-policy";
import { spaces } from "@/lib/data";
import { extraNavLabels, navIcon } from "@/lib/space-icons";

const PRIMARY_NAV_LABELS: Partial<Record<SidebarNavId, string>> = {
  research: "Studio",
};

export function navLabel(id: SidebarNavId) {
  if (PRIMARY_NAV_LABELS[id]) return PRIMARY_NAV_LABELS[id];
  if (isExtraNavId(id)) return extraNavLabels[id];
  return spaces.find((item) => item.id === id)?.label;
}

export function useMainNavItems() {
  const { workspaceId, actor, workspacePolicies, sidebarLayout, billingPlan } =
    useApp();

  const { main } = resolveSidebarNav(
    memberSpaces(workspaceId, actor.id, workspacePolicies),
    sidebarLayout,
    { billingPlan },
  );

  return main
    .map((id) => {
      const label = navLabel(id);
      if (!label) return null;
      return { id, label, Icon: navIcon(id) };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}
