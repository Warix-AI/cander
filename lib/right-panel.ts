import { isChatSpace } from "@/lib/spaces";
import type { CourierView, NavDestinationId } from "@/lib/types";

export function chatIsActive(opts: {
  thread: unknown;
  drafting: boolean;
}) {
  return Boolean(opts.thread) || opts.drafting;
}

export function canUseRightPanel(opts: {
  view: CourierView;
  thread: unknown;
  drafting: boolean;
  spaceId: NavDestinationId | null;
  connectorId?: string | null;
  projectId?: string | null;
  jobId?: string | null;
  skillId?: string | null;
}) {
  if (!chatIsActive(opts)) return false;
  if (opts.view === "chat") return true;
  if (opts.view !== "space") return false;
  return (
    isChatSpace(opts.spaceId) ||
    Boolean(opts.connectorId) ||
    Boolean(opts.projectId) ||
    Boolean(opts.jobId) ||
    Boolean(opts.skillId)
  );
}
