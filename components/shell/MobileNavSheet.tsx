"use client";

import type { ReactNode } from "react";
import { MOBILE_NAV_HEIGHT, type MobileSheetId } from "@/lib/mobile-nav";
import { cn } from "@/lib/utils";

type MobileNavSheetProps = {
  open: boolean;
  sheetId: MobileSheetId;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export function MobileNavSheet({
  open,
  onClose,
  children,
  className,
}: MobileNavSheetProps) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        className="fixed inset-0 z-40 bg-foreground/10 lg:hidden"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          bottom: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
        }}
        className={cn(
          "fixed inset-x-0 z-50 light-surface rounded-t-[14px] border-b-0 bg-popover text-popover-foreground shadow-[0_-8px_24px_oklch(0_0_0/0.06)] dark:bg-transparent dark:shadow-[0_-8px_24px_oklch(0_0_0/0.08)] transition-transform duration-200 lg:hidden",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}
