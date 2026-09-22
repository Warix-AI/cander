"use client";

import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

type NavIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
};

/**
 * Medium-heavy rounded stroke language.
 * Default sizes are ~20% above the prior Lucide 16/18 footprint.
 */
const DEFAULT_STROKE = 2;
export const NAV_ICON_RAIL = 22;
export const NAV_ICON_HEADER = 19;

function NavIconBase({
  size = NAV_ICON_RAIL,
  strokeWidth = DEFAULT_STROKE,
  className,
  children,
  ...rest
}: NavIconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("shrink-0", className)}
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Close / open left panel — rounded frame with a rail. */
export function IconPanel({
  className,
  size = NAV_ICON_HEADER,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <rect x="3.25" y="4.25" width="17.5" height="15.5" rx="3.75" />
      <path d="M9.25 4.25v15.5" />
    </NavIconBase>
  );
}

/** Search — clear ring + handle. */
export function IconSearch({
  className,
  size = NAV_ICON_HEADER,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <circle cx="10.75" cy="10.75" r="6" />
      <path d="M15.5 15.5 20.25 20.25" />
    </NavIconBase>
  );
}

/** New chat — rounded square + pencil (compose). */
export function IconNewChat({
  className,
  size = NAV_ICON_RAIL,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.25" />
      <path d="M13.5 6.5 17.5 10.5" />
      <path d="M14.75 5.75h3.5v3.5" />
    </NavIconBase>
  );
}

/** Workspaces — three soft stacked sheets. */
export function IconWorkspaces({
  className,
  size = NAV_ICON_RAIL,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <rect x="5.5" y="4.5" width="13" height="4.25" rx="1.75" />
      <rect x="5.5" y="9.875" width="13" height="4.25" rx="1.75" />
      <rect x="5.5" y="15.25" width="13" height="4.25" rx="1.75" />
    </NavIconBase>
  );
}

/** Apps — 2×2 soft tiles. */
export function IconApps({
  className,
  size = NAV_ICON_RAIL,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2.35" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2.35" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2.35" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2.35" />
    </NavIconBase>
  );
}

/** Chats — single rounded bubble with a soft tail. */
export function IconChats({
  className,
  size = NAV_ICON_RAIL,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M5.75 5.75h12.5A3.25 3.25 0 0 1 21.5 9v5.25a3.25 3.25 0 0 1-3.25 3.25h-5.4L8.25 20.5v-3H5.75A3.25 3.25 0 0 1 2.5 14.25V9A3.25 3.25 0 0 1 5.75 5.75Z" />
    </NavIconBase>
  );
}

/**
 * Images — two stacked rounded frames with sun + mountains
 * (matches the reference gallery glyph).
 */
export function IconImages({
  className,
  size = NAV_ICON_RAIL,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      {/* Back frame — offset up-right */}
      <rect x="6.5" y="3.25" width="14" height="14" rx="3.25" />
      {/* Front frame */}
      <rect x="3.25" y="6.5" width="14" height="14" rx="3.25" />
      {/* Sun */}
      <circle cx="13.85" cy="11.15" r="1.35" />
      {/* Mountains */}
      <path d="M5.35 17.85 9.1 14.35l2.55 2.15 2.95-3.2 2.75 4.55" />
    </NavIconBase>
  );
}

/** Notifications — soft bell. */
export function IconNotifications({
  className,
  size = NAV_ICON_RAIL,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M7.25 18.25h9.5" />
      <path d="M9.6 18.25a2.4 2.4 0 0 0 4.8 0" />
      <path d="M6.35 11a5.65 5.65 0 0 1 11.3 0c0 2.9 1.05 4.4 1.05 4.4H5.3S6.35 13.9 6.35 11Z" />
      <path d="M12 4.6v1.35" />
    </NavIconBase>
  );
}

/** General / account. */
export function IconGeneral({
  className,
  size = NAV_ICON_RAIL,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <circle cx="12" cy="8" r="3.35" />
      <path d="M5.4 19.35c.95-3.35 3.35-5.1 6.6-5.1s5.65 1.75 6.6 5.1" />
    </NavIconBase>
  );
}

/** Plus — matched stroke for hover-add / Add rows. */
export function IconPlus({
  className,
  size = NAV_ICON_RAIL,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M12 5.25v13.5" />
      <path d="M5.25 12h13.5" />
    </NavIconBase>
  );
}

export type NavIconComponent = typeof IconPanel;
