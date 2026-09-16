import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";

/** Off-black menu canvas — contrasts with the dark-gray chat peek. */
export const MOBILE_MENU_BG = "mobile-menu-canvas";

/** Main app surfaces on mobile — pure white in light, dark gray in dark. */
export const MOBILE_APP_BG = "bg-white mobile-app-surface";

/** Space dashboards — off-white in light; menu-matched canvas in dark. */
export const SPACE_CANVAS_BG = "bg-space-canvas";

/** Settings groups on mobile — flat surfaces that respect light/dark. */
export const MOBILE_SETTINGS_SURFACE =
  "border border-border/60 bg-muted/40 dark:border-white/10 dark:bg-neutral-900";

/** ChatGPT-style peek strip radius when the menu drawer is open. */
export const MOBILE_PEEK_RADIUS = "rounded-l-[48px]";

/** Matches MobilePager / MobileMenuScaffold CSS transition duration. */
export const MOBILE_PAGER_MS = 500;

/** Shared Apple-style glass material classes (see globals.css). */
export const MOBILE_GLASS_BAR = "mobile-glass-bar";
export const MOBILE_GLASS_PANEL = "mobile-glass-panel";
export const MOBILE_GLASS_POPOVER = "mobile-glass-popover";
export const MOBILE_GLASS_PILL = "mobile-glass-pill";
export const MOBILE_GLASS_SEGMENT = "mobile-glass-segment";
export const MOBILE_GLASS_SEGMENT_ACTIVE = "mobile-glass-segment-active";
export const MOBILE_GLASS_CARD = "mobile-glass-card";
export const MOBILE_GLASS_INSET = "mobile-glass-inset";
export const MOBILE_GLASS_DOCK = "mobile-glass-dock";

export const mobileMenuRowClass = [
  "flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[16px] font-medium tracking-[-0.02em] transition-colors duration-200",
  SHELL_G3_RADIUS,
  "hover:bg-black/[0.03] dark:hover:bg-white/8",
].join(" ");

/**
 * Desktop sidebar rows — primary nav (New / Apps / Experts / Chats / General).
 */
export const SIDEBAR_ROW =
  "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[14px] tracking-[-0.01em] transition-colors duration-150";
export const SIDEBAR_ROW_HOVER =
  "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]";
export const SIDEBAR_ROW_ICON =
  "h-4 w-4 shrink-0 text-muted-foreground";
/**
 * Contextual secondary rows under an expanded primary section.
 * Indent + tighter rhythm; inactive text is quieter.
 */
export const SIDEBAR_ROW_SECONDARY =
  "flex w-full items-center gap-2 rounded-[7px] px-2 py-[5px] text-left text-[13px] tracking-[-0.01em] text-foreground/70 transition-colors duration-150";
export const SIDEBAR_ROW_SECONDARY_ICON =
  "h-3 w-3 shrink-0 text-muted-foreground/80";
/** Glass G3 pill for the chosen Apps | Experts | Chats mode (never leaf blue). */
export const SIDEBAR_SEGMENT_ACTIVE = "shell-segment-active";
/** Leaf destination (Gmail, Expert, Chat). */
export const PRIMARY_NAV_CARD_ACTIVE = "shell-select-active";
/** @deprecated Prefer SIDEBAR_SEGMENT_ACTIVE for section chrome. */
export const PRIMARY_NAV_PARENT_ACTIVE = "shell-segment-active";
export const PRIMARY_NAV_CARD_HOVER = SIDEBAR_ROW_HOVER;

export const mobileMenuRowActiveClass =
  "shell-select-active font-semibold";

export const MOBILE_MENU_ICON_STROKE = 2.15;
/** Letter-height glyphs — match desktop sidebar / connector `nav` marks. */
export const MOBILE_MENU_ICON_SIZE = "h-3.5 w-3.5";

/** @deprecated Prefer SIDEBAR_ROW — kept for mobile card edge radii. */
export const PRIMARY_NAV_CARD_RADIUS_FIRST = "primary-nav-card-first";
export const PRIMARY_NAV_CARD_RADIUS_LAST = "primary-nav-card-last";
/** Single-row inset (product switcher) — all four corners; first+last conflict in CSS. */
export const PRIMARY_NAV_CARD_RADIUS_SOLO = "primary-nav-card-solo";
/** Mobile New/Apps/Chats card uses 12px shell — slightly tighter inner curve. */
export const PRIMARY_NAV_CARD_RADIUS_FIRST_MOBILE =
  "primary-nav-card-first-mobile";
export const PRIMARY_NAV_CARD_RADIUS_LAST_MOBILE =
  "primary-nav-card-last-mobile";

/** Chrome icon / pill button on mobile. */
export const mobileChromeButtonClass =
  "mobile-glass-segment inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors duration-200 hover:bg-muted";
