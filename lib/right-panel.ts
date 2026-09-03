import { isDockChatSpace } from "@/lib/spaces";
import type { CourierView, NavDestinationId, SpaceId } from "@/lib/types";

/** Default right-panel share when chat + panel are split (higher = narrower chat). */
export const DEFAULT_PANEL_RATIO = 0.68;
/** Compact share for new-chat “What would you like to do?” choice panel only. */
export const NEW_CHAT_CHOICE_PANEL_RATIO = 0.48;
/** Minimum panel share applied when opening the panel from a collapsed state. */
export const PANEL_RATIO_OPEN_FLOOR = DEFAULT_PANEL_RATIO;
/** Wide panel mode never gives the right column less than this share. */
export const PANEL_RATIO_WIDE_FLOOR = DEFAULT_PANEL_RATIO;

/** Pinned chat column width when the space panel is expanded. */
export const PINNED_CHAT_WIDTH =
  "w-[32%] min-w-[16rem] max-w-[26rem] shrink-0";

/** Home / split chat column cap when the right panel is open. */
export const SPLIT_CHAT_MAX_WIDTH = "max-w-[32rem]";

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

/** Home chat route — includes armed drafts; used for right-panel chrome placement. */
export function isHomeChatView(opts: {
  view: CourierView;
  spaceId?: NavDestinationId | null;
  projectId?: string | null;
}) {
  return opts.view === "chat" && !opts.spaceId && !opts.projectId;
}

/** Standalone browser on home chat, or ephemeral quick search on Explore. */
export function showStandaloneBrowserPanel(opts: {
  standaloneBrowserOpen: boolean;
  standaloneBrowserEphemeral?: boolean;
  view: CourierView;
  spaceId: NavDestinationId | null;
  projectId?: string | null;
}) {
  if (!opts.standaloneBrowserOpen || opts.projectId) return false;

  if (opts.standaloneBrowserEphemeral) {
    return opts.view === "space" && Boolean(opts.spaceId) && !opts.projectId;
  }

  return (
    opts.view === "chat" &&
    !opts.spaceId
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
    isDockChatSpace(opts.spaceId as SpaceId | null) ||
    Boolean(opts.connectorId) ||
    Boolean(opts.projectId) ||
    Boolean(opts.jobId) ||
    Boolean(opts.skillId)
  );
}
