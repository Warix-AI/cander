"use client";

import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

type NavIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
};

/** ChatGPT-adjacent stroke language: medium-thick, fully rounded caps/joins. */
const DEFAULT_STROKE = 2;

function NavIconBase({
  size = 18,
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

/** Close / open left panel. */
export function IconPanel({
  className,
  size = 16,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <rect x="3" y="4" width="18" height="16" rx="4" />
      <path d="M9 4v16" />
    </NavIconBase>
  );
}

/** Search. */
export function IconSearch({
  className,
  size = 16,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <circle cx="11" cy="11" r="6.25" />
      <path d="M16.25 16.25 20.5 20.5" />
    </NavIconBase>
  );
}

/** New chat — rounded square + stylus (inspiration: compose). */
export function IconNewChat({
  className,
  size = 18,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <path d="M13.25 6.75 17.25 10.75" />
      <path d="M9 15.5h4.5" />
    </NavIconBase>
  );
}

/** Workspaces — soft stacked planes. */
export function IconWorkspaces({
  className,
  size = 18,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M5 10.25 12 6.5l7 3.75-7 3.75-7-3.75Z" />
      <path d="M5 13.5 12 17.25l7-3.75" />
      <path d="M5 16.5 12 20.25l7-3.75" />
    </NavIconBase>
  );
}

/** Apps — four soft modules (inspiration: sites / command grid). */
export function IconApps({
  className,
  size = 18,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <rect x="3.75" y="3.75" width="6.75" height="6.75" rx="2.25" />
      <rect x="13.5" y="3.75" width="6.75" height="6.75" rx="2.25" />
      <rect x="3.75" y="13.5" width="6.75" height="6.75" rx="2.25" />
      <rect x="13.5" y="13.5" width="6.75" height="6.75" rx="2.25" />
    </NavIconBase>
  );
}

/** Chats — rounded message capsule. */
export function IconChats({
  className,
  size = 18,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M6 6.5h12a3.5 3.5 0 0 1 3.5 3.5v4A3.5 3.5 0 0 1 18 17.5h-5.25L8 21v-3.5H6A3.5 3.5 0 0 1 2.5 14V10A3.5 3.5 0 0 1 6 6.5Z" />
    </NavIconBase>
  );
}

/** Images — overlapping rounded frames + landscape (inspiration). */
export function IconImages({
  className,
  size = 18,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <rect x="2.75" y="6.5" width="14.5" height="12.25" rx="3.25" />
      <path d="M7.5 4.75h9.75A3.25 3.25 0 0 1 20.5 8v8.25" />
      <path d="M5.25 15.75 8.5 12.75l2.35 2.1 2.9-3.15 3.25 4.05" />
    </NavIconBase>
  );
}

/** Notifications — soft bell. */
export function IconNotifications({
  className,
  size = 18,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M7 18h10" />
      <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
      <path d="M6.25 11a5.75 5.75 0 0 1 11.5 0c0 2.85 1 4.25 1 4.25H5.25S6.25 13.85 6.25 11Z" />
      <path d="M12 4.5v1.25" />
    </NavIconBase>
  );
}

/** General / account. */
export function IconGeneral({
  className,
  size = 18,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <circle cx="12" cy="8.25" r="3.5" />
      <path d="M5.25 19.5c1-3.5 3.4-5.25 6.75-5.25s5.75 1.75 6.75 5.25" />
    </NavIconBase>
  );
}

/** Plus — matched stroke for hover-add / Add rows. */
export function IconPlus({
  className,
  size = 18,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M12 5.5v13" />
      <path d="M5.5 12h13" />
    </NavIconBase>
  );
}

export type NavIconComponent = typeof IconPanel;
