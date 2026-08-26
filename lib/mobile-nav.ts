export const MOBILE_NAV_HEIGHT = 68;
export const MOBILE_NAV_INNER_HEIGHT = 64;

export type MobileSheetId = "spaces" | "pins" | "workspace" | "account";

export type MobileNavTabId =
  | "chat"
  | "spaces"
  | "pins"
  | "workspace"
  | "account";

export function mobileBottomInset(extra = "0px") {
  return `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom) + ${extra})`;
}
