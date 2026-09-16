"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

const STROKE_WIDTH = 3;
const CORNER_RADIUS = 10;
/** Clearance from section / child hover pills. */
const STROKE_GAP = 5;
/** Extra indent for children past the section icon + stroke curve. */
const CHILD_PAD_LEFT = 42;

/** Smooth expand / collapse — one motion, no per-row stagger. */
const ANIM_MS = 260;
const ANIM_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
/** Path draws top → curve → item. */
const STROKE_DRAW_MS = 320;

/**
 * Expandable pin folder.
 * Default: optional Reddit-style rail into the active child.
 * `flat`: no rail / no child indent (left-aligned list).
 * `headerOnly`: toggle row only — caller renders children elsewhere.
 * `bodyOnly`: animated children panel only (no header / no stroke).
 */
export function PinSectionFolder({
  label,
  icon: Icon,
  expanded,
  onToggle,
  activeKey,
  deps,
  children,
  headerClassName,
  iconClassName,
  iconStrokeWidth = 2,
  flat = false,
  headerOnly = false,
  bodyOnly = false,
}: {
  label: string;
  icon: (props: { className?: string; strokeWidth?: number }) => ReactNode;
  expanded: boolean;
  sectionActive?: boolean;
  onToggle: () => void;
  /** `${kind}:${id}` of the active child, or null. */
  activeKey: string | null;
  deps?: unknown;
  children?: ReactNode;
  headerClassName?: string;
  iconClassName?: string;
  iconStrokeWidth?: number;
  /** Left-aligned children; skip the tree stroke. */
  flat?: boolean;
  /** Render the header toggle only (body lives outside this component). */
  headerOnly?: boolean;
  /** Render the animated body only (header lives elsewhere). */
  bodyOnly?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const iconWrapRef = useRef<HTMLSpanElement>(null);
  const headerRef = useRef<HTMLButtonElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const pathElRef = useRef<SVGPathElement>(null);
  const skipStroke = flat || headerOnly || bodyOnly;
  const showHeader = !bodyOnly;
  const showBody = !headerOnly;
  const [path, setPath] = useState<string | null>(null);
  const [mounted, setMounted] = useState(expanded && showBody);
  const [animOpen, setAnimOpen] = useState(expanded && showBody);
  const [height, setHeight] = useState<number | "auto">(
    expanded && showBody ? "auto" : 0,
  );

  useEffect(() => {
    if (!showBody) {
      setMounted(false);
      setAnimOpen(false);
      setHeight(0);
      setPath(null);
      return;
    }

    if (expanded) {
      setMounted(true);
      setHeight(0);
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const next = innerRef.current?.scrollHeight ?? 0;
          setHeight(next);
          setAnimOpen(true);
        });
      });
      const settle = window.setTimeout(() => setHeight("auto"), ANIM_MS + 16);
      return () => {
        cancelAnimationFrame(frame);
        window.clearTimeout(settle);
      };
    }

    const current = innerRef.current?.scrollHeight ?? 0;
    setHeight(current);
    setAnimOpen(false);
    setPath(null);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setHeight(0));
    });
    const done = window.setTimeout(() => setMounted(false), ANIM_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(done);
    };
  }, [expanded, showBody]);

  useLayoutEffect(() => {
    if (skipStroke) {
      setPath(null);
      return;
    }
    const root = rootRef.current;
    const iconWrap = iconWrapRef.current;
    const header = headerRef.current;
    if (!root || !iconWrap || !header || !animOpen || !activeKey) {
      setPath(null);
      return;
    }

    const measure = () => {
      const active = root.querySelector(
        `[data-pin-tree-key="${CSS.escape(activeKey)}"]`,
      ) as HTMLElement | null;
      if (!active) {
        setPath(null);
        return;
      }

      const rootBox = root.getBoundingClientRect();
      const iconBox = iconWrap.getBoundingClientRect();
      const headerBox = header.getBoundingClientRect();
      const activeBox = active.getBoundingClientRect();

      const x = iconBox.left + iconBox.width / 2 - rootBox.left;
      const inset = STROKE_GAP + STROKE_WIDTH / 2;
      const y0 = headerBox.bottom - rootBox.top + inset;
      const y1 = activeBox.top + activeBox.height / 2 - rootBox.top;
      const xEnd = activeBox.left - rootBox.left - inset;

      const r = Math.min(
        CORNER_RADIUS,
        Math.max(0, y1 - y0),
        Math.max(0, xEnd - x),
      );
      if (y1 <= y0 + 2 || xEnd <= x + 2) {
        setPath(null);
        return;
      }

      setPath(
        [
          `M ${x} ${y0}`,
          `L ${x} ${y1 - r}`,
          `Q ${x} ${y1} ${x + r} ${y1}`,
          `L ${xEnd} ${y1}`,
        ].join(" "),
      );
    };

    measure();
    const t = window.setTimeout(measure, ANIM_MS + 20);
    return () => window.clearTimeout(t);
  }, [activeKey, deps, animOpen, skipStroke]);

  // Draw the stroke from the top down into the active item.
  useLayoutEffect(() => {
    if (skipStroke) return;
    const el = pathElRef.current;
    if (!el || !path || !animOpen) return;

    const length = el.getTotalLength();
    el.style.transition = "none";
    el.style.strokeDasharray = `${length}`;
    el.style.strokeDashoffset = `${length}`;
    // Force layout so the hidden state sticks before animating.
    void el.getBoundingClientRect();
    const frame = requestAnimationFrame(() => {
      el.style.transition = `stroke-dashoffset ${STROKE_DRAW_MS}ms ${ANIM_EASE}`;
      el.style.strokeDashoffset = "0";
    });
    return () => cancelAnimationFrame(frame);
  }, [path, animOpen, activeKey, skipStroke]);

  return (
    <div ref={rootRef} className="relative">
      {showHeader ? (
        <button
          ref={headerRef}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggle();
            headerRef.current?.blur();
          }}
          aria-expanded={expanded}
          className={headerClassName}
        >
          <span
            ref={iconWrapRef}
            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
          >
            <Icon className={iconClassName} strokeWidth={iconStrokeWidth} />
          </span>
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
      ) : null}

      {showBody && mounted ? (
        <div
          className="overflow-hidden"
          style={{
            height,
            transition: `height ${ANIM_MS}ms ${ANIM_EASE}`,
          }}
        >
          <div
            ref={innerRef}
            className="relative flex flex-col"
            style={{
              paddingLeft: flat || bodyOnly ? 0 : CHILD_PAD_LEFT,
              opacity: animOpen ? 1 : 0,
              transform: animOpen ? "translateY(0)" : "translateY(-6px)",
              transition: `opacity ${ANIM_MS}ms ${ANIM_EASE}, transform ${ANIM_MS}ms ${ANIM_EASE}`,
            }}
          >
            {children}
          </div>
        </div>
      ) : null}

      {!skipStroke && path ? (
        <svg
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full overflow-visible opacity-70",
            !animOpen && "opacity-0",
          )}
          style={{
            color:
              "color-mix(in oklch, var(--sidebar-accent) 88%, var(--foreground) 12%)",
          }}
        >
          <path
            ref={pathElRef}
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </div>
  );
}

/** Header fill when the folder is open or owns the current view. */
export function pinSectionHeaderClass(active?: boolean) {
  return cn(
    "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-left text-[13px] tracking-[-0.01em] transition-colors duration-150",
    active
      ? "shell-segment-active"
      : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
  );
}
