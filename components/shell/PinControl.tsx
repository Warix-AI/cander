"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pin } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import type { PinKind, PinTier } from "@/lib/types";
import { cn } from "@/lib/utils";

type PinControlProps = {
  kind: PinKind;
  id: string;
  className?: string;
  iconClassName?: string;
  /** Show the control even when the parent is not hovered (e.g. top rail). */
  alwaysVisible?: boolean;
};

type MenuPos = { top: number; left: number };

export function PinControl({
  kind,
  id,
  className,
  iconClassName,
  alwaysVisible = false,
}: PinControlProps) {
  const { pinTier, setPin, clearPin } = useApp();
  const tier = pinTier(kind, id);
  const pinned = Boolean(tier);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const place = () => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = menu?.offsetWidth ?? 168;
    const menuHeight = menu?.offsetHeight ?? 88;
    const gap = 6;
    const pad = 8;

    let left = rect.right - menuWidth;
    left = Math.min(left, window.innerWidth - menuWidth - pad);
    left = Math.max(pad, left);

    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - pad) {
      top = Math.max(pad, rect.top - menuHeight - gap);
    }

    setPos({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
  }, [open, pinned, tier]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onReposition = () => place();
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const choose = (next: PinTier | "unpin") => {
    if (next === "unpin") clearPin(kind, id);
    else setPin(kind, id, next);
    setOpen(false);
  };

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          style={
            pos
              ? { top: pos.top, left: pos.left }
              : { top: 0, left: 0, visibility: "hidden" }
          }
          className="fixed z-[200] min-w-[11rem] rounded-[10px] border border-border bg-popover p-1 text-popover-foreground shadow-[0_12px_40px_oklch(0_0_0/0.22)]"
        >
          {!pinned ? (
            <>
              <MenuItem
                label="Pin to Primary"
                onSelect={() => choose("primary")}
              />
              <MenuItem
                label="Pin to Secondary"
                onSelect={() => choose("secondary")}
              />
            </>
          ) : (
            <>
              <MenuItem label="Unpin" onSelect={() => choose("unpin")} />
              {tier !== "primary" ? (
                <MenuItem
                  label="Move to Primary"
                  onSelect={() => choose("primary")}
                />
              ) : null}
              {tier !== "secondary" ? (
                <MenuItem
                  label="Move to Secondary"
                  onSelect={() => choose("secondary")}
                />
              ) : null}
            </>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={pinned ? "Pin options" : "Pin"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-pressed={pinned}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity duration-200 hover:text-foreground",
          alwaysVisible
            ? "h-8 w-8 rounded-lg hover:bg-muted"
            : open
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          pinned && "text-foreground",
        )}
      >
        <Pin
          className={cn(
            alwaysVisible ? "h-4 w-4" : "h-3 w-3",
            pinned && "fill-current",
            iconClassName,
          )}
          strokeWidth={alwaysVisible ? 1.6 : 2}
        />
      </button>
      {menu}
    </div>
  );
}

function MenuItem({
  label,
  onSelect,
}: {
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className="flex w-full shrink-0 items-center rounded-[8px] px-3 py-2 text-left text-[13px] leading-5 font-medium tracking-[-0.01em] whitespace-nowrap transition-colors duration-150 hover:bg-muted"
    >
      {label}
    </button>
  );
}
