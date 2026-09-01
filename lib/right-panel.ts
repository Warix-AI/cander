import { isChatSpace } from "@/lib/spaces";
import type { CourierView, NavDestinationId } from "@/lib/types";

/** Empty home chat — no space, thread, or draft armed. */
export function isNewChatScreen(opts: {
  view: CourierView;
  threadId?: string | null;
  thread?: unknown;
  spaceId?: NavDestinationId | null;
  projectId?: string | null;
  drafting?: boolean;
}) {
  return (
    opts.view === "chat" &&
    !opts.threadId &&
    !opts.thread &&
    !opts.spaceId &&
    !opts.projectId &&
    !opts.drafting
  );
}

/** Standalone browser only belongs on home chat — never on a space or project. */
export function showStandaloneBrowserPanel(opts: {
  standaloneBrowserOpen: boolean;
  view: CourierView;
  spaceId: NavDestinationId | null;
  projectId?: string | null;
}) {
  return (
    opts.standaloneBrowserOpen &&
    opts.view === "chat" &&
    !opts.spaceId &&
    !opts.projectId
  );
}

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
  // Home New Chat / empty landing — allow opening the choice panel before a send.
  if (opts.view === "chat") return true;
  if (!chatIsActive(opts)) return false;
  if (opts.view !== "space") return false;
  return (
    isChatSpace(opts.spaceId) ||
    Boolean(opts.connectorId) ||
    Boolean(opts.projectId) ||
    Boolean(opts.jobId) ||
    Boolean(opts.skillId)
  );
}
