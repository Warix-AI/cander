"use client";

import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

type NavIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
};

/**
 * Lucide-shaped shell icons with slightly softer corner radii.
 * Images stays on the stock Lucide ImageIcon.
 */
const DEFAULT_STROKE = 1.75;

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

/** PanelLeft — frame with a softer rail. */
export function IconPanel({
  className,
  size = 16,
  strokeWidth = 1.6,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <rect x="3" y="4" width="18" height="16" rx="3.5" />
      <path d="M9 4v16" />
    </NavIconBase>
  );
}

/** Search — same silhouette, matched stroke. */
export function IconSearch({
  className,
  size = 16,
  strokeWidth = 1.7,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </NavIconBase>
  );
}

/** New chat / SquarePen — softer rounded square. */
export function IconNewChat({
  className,
  size = 16,
  strokeWidth = 1.7,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M13.5 4.5 19.5 10.5" />
      <path d="M15 3h6v6" />
      <path d="M19 13.5V19a2.75 2.75 0 0 1-2.75 2.75H5.75A2.75 2.75 0 0 1 3 19V7.75A2.75 2.75 0 0 1 5.75 5H11" />
    </NavIconBase>
  );
}

/** Workspaces — soft stacked sheets. */
export function IconWorkspaces({
  className,
  size = 18,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <rect x="5" y="4.25" width="14" height="4.5" rx="2" />
      <rect x="5" y="9.75" width="14" height="4.5" rx="2" />
      <rect x="5" y="15.25" width="14" height="4.5" rx="2" />
    </NavIconBase>
  );
}

/** Apps / LayoutGrid — tiles with softer corners. */
export function IconApps({
  className,
  size = 18,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2.35" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2.35" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2.35" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.35" />
    </NavIconBase>
  );
}

/** Chats / MessageSquare — softer bubble. */
export function IconChats({
  className,
  size = 18,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M6.5 4.5h11A3.5 3.5 0 0 1 21 8v6.5a3.5 3.5 0 0 1-3.5 3.5H12l-4.5 3v-3H6.5A3.5 3.5 0 0 1 3 14.5V8A3.5 3.5 0 0 1 6.5 4.5Z" />
    </NavIconBase>
  );
}

/** Notifications / Bell. */
export function IconNotifications({
  className,
  size = 18,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M6.5 8.5a5.5 5.5 0 0 1 11 0c0 3.2 1.2 4.8 1.2 4.8H5.3S6.5 11.7 6.5 8.5Z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </NavIconBase>
  );
}

/** General / CircleUser. */
export function IconGeneral({
  className,
  size = 18,
  strokeWidth = DEFAULT_STROKE,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <circle cx="12" cy="12" r="9.25" />
      <circle cx="12" cy="9.25" r="3" />
      <path d="M6.4 18.4a6.1 6.1 0 0 1 11.2 0" />
    </NavIconBase>
  );
}

export type NavIconComponent = typeof IconPanel;
