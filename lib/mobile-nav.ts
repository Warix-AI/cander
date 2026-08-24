export const MOBILE_NAV_HEIGHT = 68;
export const MOBILE_NAV_INNER_HEIGHT = 64;

export type MobileSheetId = "spaces" | "pins" | "workspace";

export type MobileNavTabId =
  | "home"
  | "spaces"
  | "pins"
  | "workspace"
  | "settings";

export function mobileBottomInset(extra = "0px") {
  return `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom) + ${extra})`;
}
