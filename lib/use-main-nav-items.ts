"use client";

import { useApp } from "@/components/app/AppProvider";
import { spaces } from "@/lib/data";
import { extraNavLabels, navIcon } from "@/lib/space-icons";
import {
  isExtraNavId,
  resolveSidebarNav,
  type SidebarNavId,
} from "@/lib/spaces";
import { memberSpaces } from "@/lib/workspace-policy";

export function navLabel(id: SidebarNavId) {
  if (isExtraNavId(id)) return extraNavLabels[id];
  return spaces.find((item) => item.id === id)?.label;
}

export function useMainNavItems() {
  const {
    workspace,
    actor,
    workspacePolicies,
    sidebarLayout,
    billingPlan,
    personalSpaceEnabled,
  } = useApp();

  const { main } = resolveSidebarNav(
    memberSpaces(workspace.id, actor.id, workspacePolicies),
    sidebarLayout,
    { billingPlan, personalEnabled: personalSpaceEnabled },
  );

  return main
    .map((id) => {
      const label = navLabel(id);
      if (!label) return null;
      return { id, label, Icon: navIcon(id) };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}
