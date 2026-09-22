"use client";

import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

type NavIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
};

function NavIconBase({
  size = 18,
  strokeWidth = 1.5,
  className,
  children,
  ...rest
}: NavIconProps & { children: ReactNode }) {
  const dim = typeof size === "number" ? size : size;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={dim}
      height={dim}
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

/** Close / open left panel — slim dual rail with a cut. */
export function IconPanel({ className, size = 16, strokeWidth = 1.55, ...rest }: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <path d="M9 4v16" />
      <path d="M12.5 9.5h5" />
      <path d="M12.5 14.5h5" />
    </NavIconBase>
  );
}

/** Search — crisp arc with a tapered stem. */
export function IconSearch({ className, size = 16, strokeWidth = 1.55, ...rest }: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15.5 15.5L20.5 20.5" />
      <path d="M8.25 10.5h4.5" opacity="0.55" />
    </NavIconBase>
  );
}

/** New chat — squared frame with a precision stylus. */
export function IconNewChat({ className, size = 18, strokeWidth = 1.5, ...rest }: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M5 16.5V7.5A2.5 2.5 0 0 1 7.5 5H14" />
      <path d="M19 10v6.5A2.5 2.5 0 0 1 16.5 19H7.5" />
      <path d="M14.5 4.5l5 5" />
      <path d="M19.5 9.5V5.5h-4" />
      <path d="M8.5 15.5h4" />
    </NavIconBase>
  );
}

/** Workspaces — offset translucent planes. */
export function IconWorkspaces({ className, size = 18, strokeWidth = 1.5, ...rest }: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M4.5 9.5 12 5.5l7.5 4-7.5 4-7.5-4Z" />
      <path d="M4.5 13.25 12 17.25l7.5-4" />
      <path d="M4.5 16.5 12 20.5l7.5-4" />
    </NavIconBase>
  );
}

/** Apps — four soft modules with a slight perspective gap. */
export function IconApps({ className, size = 18, strokeWidth = 1.5, ...rest }: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.75" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.75" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.75" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.75" />
    </NavIconBase>
  );
}

/** Chats — angular message capsule. */
export function IconChats({ className, size = 18, strokeWidth = 1.5, ...rest }: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M5.5 6.5h13A2.5 2.5 0 0 1 21 9v5.5A2.5 2.5 0 0 1 18.5 17H11l-4.5 3.25V17H5.5A2.5 2.5 0 0 1 3 14.5V9A2.5 2.5 0 0 1 5.5 6.5Z" />
      <path d="M8 11.25h8" opacity="0.55" />
    </NavIconBase>
  );
}

/** Images — aperture frame. */
export function IconImages({ className, size = 18, strokeWidth = 1.5, ...rest }: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.75" />
      <path d="M3.5 15.5 9 12.5l3.5 2.5 4-4 4 3.5" />
    </NavIconBase>
  );
}

/** Notifications — thin bell with a cut ring. */
export function IconNotifications({
  className,
  size = 17,
  strokeWidth = 1.5,
  ...rest
}: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M7 17.5h10" />
      <path d="M9.25 17.5a2.75 2.75 0 0 0 5.5 0" />
      <path d="M6 10.5a6 6 0 0 1 12 0c0 3.25 1.15 4.5 1.15 4.5H4.85S6 13.75 6 10.5Z" />
      <path d="M12 4.25v1.1" />
    </NavIconBase>
  );
}

/** General / account — geometric person mark. */
export function IconGeneral({ className, size = 17, strokeWidth = 1.5, ...rest }: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19.25c.85-3.4 3.35-5 6.5-5s5.65 1.6 6.5 5" />
    </NavIconBase>
  );
}

/** Plus — matched stroke language for hover-add morph. */
export function IconPlus({ className, size = 18, strokeWidth = 1.5, ...rest }: NavIconProps) {
  return (
    <NavIconBase size={size} strokeWidth={strokeWidth} className={className} {...rest}>
      <path d="M12 5.5v13" />
      <path d="M5.5 12h13" />
    </NavIconBase>
  );
}

export type NavIconComponent = typeof IconPanel;
