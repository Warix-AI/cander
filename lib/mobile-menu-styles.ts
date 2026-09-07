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
export const MOBILE_GLASS_PILL = "mobile-glass-pill";
export const MOBILE_GLASS_SEGMENT = "mobile-glass-segment";
export const MOBILE_GLASS_SEGMENT_ACTIVE = "mobile-glass-segment-active";
export const MOBILE_GLASS_CARD = "mobile-glass-card";
export const MOBILE_GLASS_INSET = "mobile-glass-inset";
export const MOBILE_GLASS_DOCK = "mobile-glass-dock";

export const mobileMenuRowClass = [
  "flex w-full items-center gap-3 px-4 py-[0.825rem] text-left text-[16px] font-medium tracking-[-0.02em] transition-colors duration-200",
  SHELL_G3_RADIUS,
  "hover:bg-black/[0.03] dark:hover:bg-white/8",
].join(" ");

export const mobileMenuRowActiveClass =
  "bg-black/[0.04] font-semibold dark:bg-white/8";

export const MOBILE_MENU_ICON_STROKE = 2.15;
/** Letter-height glyphs — match desktop sidebar / connector `nav` marks. */
export const MOBILE_MENU_ICON_SIZE = "h-3.5 w-3.5";

/**
 * New / Canvas inset card hover & active.
 * Light: lift toward white (short of the menu). Dark: press darker than the card.
 * `!` beats the shared row hover baked into mobileMenuRowClass.
 */
export const PRIMARY_NAV_CARD_ACTIVE =
  "!bg-white/75 font-medium dark:!bg-black/40";
export const PRIMARY_NAV_CARD_HOVER =
  "hover:!bg-white/75 dark:hover:!bg-black/40";

/** Card is G3 (20px) with 3px padding — inner highlight follows the outer curve. */
export const PRIMARY_NAV_CARD_RADIUS_FIRST = "primary-nav-card-first";
export const PRIMARY_NAV_CARD_RADIUS_LAST = "primary-nav-card-last";
/** Mobile New/Canvas card uses 12px shell — slightly tighter inner curve. */
export const PRIMARY_NAV_CARD_RADIUS_FIRST_MOBILE =
  "primary-nav-card-first-mobile";
export const PRIMARY_NAV_CARD_RADIUS_LAST_MOBILE =
  "primary-nav-card-last-mobile";

/** Chrome icon / pill button on mobile. */
export const mobileChromeButtonClass =
  "mobile-glass-segment inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors duration-200 hover:bg-muted";
