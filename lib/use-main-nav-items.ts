"use client";

import { useApp } from "@/components/app/AppProvider";
import {
  isComingSoonNav,
  isExtraNavId,
  PRIMARY_NAV_SPACES,
  resolveSidebarNav,
  type SidebarNavId,
} from "@/lib/spaces";
import { memberSpaces } from "@/lib/workspace-policy";
import { spaces } from "@/lib/data";
import { extraNavLabels, navIcon } from "@/lib/space-icons";
import type { SpaceId } from "@/lib/types";

const PRIMARY_NAV_LABELS: Partial<Record<SidebarNavId, string>> = {
  research: "Explore",
};

export function navLabel(id: SidebarNavId) {
  if (PRIMARY_NAV_LABELS[id]) return PRIMARY_NAV_LABELS[id];
  if (isExtraNavId(id)) return extraNavLabels[id];
  return spaces.find((item) => item.id === id)?.label;
}

export type MainNavItem = {
  id: SidebarNavId;
  label: string;
  Icon: ReturnType<typeof navIcon>;
  comingSoon?: boolean;
};

export function useMainNavItems(opts?: { spacesOnly?: boolean }) {
  const { workspaceId, actor, workspacePolicies, sidebarLayout, billingPlan } =
    useApp();

  const { main } = resolveSidebarNav(
    memberSpaces(workspaceId, actor.id, workspacePolicies),
    sidebarLayout,
    { billingPlan },
  );

  const visible = opts?.spacesOnly
    ? main.filter((id) => PRIMARY_NAV_SPACES.includes(id as SpaceId))
    : main;

  return visible.flatMap((id) => {
    const label = navLabel(id);
    if (!label) return [];
    const item: MainNavItem = {
      id,
      label,
      Icon: navIcon(id),
      comingSoon: isComingSoonNav(id),
    };
    return [item];
  });
}
