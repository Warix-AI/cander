"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { VoiceOrb, VoiceWaveform } from "@/components/shell/VoiceOrb";
import { MOBILE_NAV_HEIGHT } from "@/lib/mobile-nav";
import type { VoiceAnchor } from "@/lib/types";
import { cn } from "@/lib/utils";

const ORB_SIZE = 45;

function mobileNavLift() {
  if (typeof window === "undefined") return 0;
  return window.matchMedia("(min-width: 1024px)").matches ? 0 : MOBILE_NAV_HEIGHT;
}

function anchorPoint(anchor: VoiceAnchor) {
  const pad = 24;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const lift = mobileNavLift();
  switch (anchor) {
    case "top-left":
      return { x: pad + ORB_SIZE / 2, y: pad + ORB_SIZE / 2 };
    case "top-center":
      return { x: vw / 2, y: pad + ORB_SIZE / 2 };
    case "top-right":
      return { x: vw - pad - ORB_SIZE / 2, y: pad + ORB_SIZE / 2 };
    case "center-left":
      return { x: pad + ORB_SIZE / 2, y: vh / 2 };
    case "center-right":
      return { x: vw - pad - ORB_SIZE / 2, y: vh / 2 };
    case "bottom-left":
      return { x: pad + ORB_SIZE / 2, y: vh - pad - ORB_SIZE / 2 - lift };
    case "bottom-center":
      return { x: vw / 2, y: vh - pad - ORB_SIZE / 2 - lift };
    default:
      return { x: vw - pad - ORB_SIZE / 2, y: vh - pad - ORB_SIZE / 2 - lift };
  }
}

function nearestAnchor(x: number, y: number): VoiceAnchor {
  const anchors = [
    "top-left",
    "top-center",
    "top-right",
    "center-left",
    "center-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
  ] as const;
  let best: VoiceAnchor = "bottom-right";
  let bestDist = Infinity;
  for (const id of anchors) {
    const point = anchorPoint(id);
    const dist = (x - point.x) ** 2 + (y - point.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best;
}

export function VoiceControl() {
  const { voiceActive, toggleVoice, sidebarOpen, mobileNav, entitlements } =
    useApp();
  const inSidebar = sidebarOpen || mobileNav;

  if (!inSidebar || !entitlements.hasVoice) return null;

  return (
    <div className="mb-1 px-1">
      <button
        type="button"
        aria-pressed={voiceActive}
        aria-label={voiceActive ? "Stop voice" : "Start voice"}
        onClick={toggleVoice}
        className={cn(
          "flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors duration-200",
          voiceActive
            ? "bg-sidebar-accent"
            : "hover:bg-sidebar-accent",
        )}
      >
        <VoiceOrb
          active={voiceActive}
          as="div"
          size={36}
          label={voiceActive ? "Listening" : "Voice"}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium tracking-[-0.01em]">
            Voice
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {voiceActive ? "Listening…" : "Talk with Courier"}
          </span>
        </span>
        {voiceActive ? (
          <VoiceWaveform
            bars={5}
            height={14}
            className="w-8 shrink-0"
            barClassName="bg-[oklch(0.62_0.16_260)] dark:bg-[oklch(0.78_0.12_252)]"
          />
        ) : null}
      </button>
    </div>
  );
}

export function FloatingVoiceDock() {
  const {
    voiceActive,
    voiceAnchor,
    toggleVoice,
    setVoiceAnchor,
    entitlements,
    view,
    thread,
    drafting,
    product,
  } = useApp();
  const onNewChatLanding =
    product === "courier" &&
    view === "chat" &&
    !thread &&
    !drafting;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const movedRef = useRef(false);
  const originRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);

  const settle = useCallback(() => anchorPoint(voiceAnchor), [voiceAnchor]);

  useEffect(() => {
    if (!dragging) setPos(null);
  }, [voiceAnchor, dragging]);

  if (!voiceActive || onNewChatLanding || !entitlements.hasVoice) return null;

  const point = pos ?? settle();
  const half = ORB_SIZE / 2;

  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        left: point.x - half,
        top: point.y - half,
        transition: dragging ? "none" : "left 280ms ease, top 280ms ease",
      }}
    >
      <div
        className="pointer-events-auto touch-none"
        onPointerDown={(event) => {
          movedRef.current = false;
          draggingRef.current = true;
          originRef.current = { x: event.clientX, y: event.clientY };
          setDragging(true);
          setPos({ x: event.clientX, y: event.clientY });
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current) return;
          const dx = event.clientX - originRef.current.x;
          const dy = event.clientY - originRef.current.y;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
          setPos({ x: event.clientX, y: event.clientY });
        }}
        onPointerUp={(event) => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          setDragging(false);
          event.currentTarget.releasePointerCapture(event.pointerId);
          const next = nearestAnchor(event.clientX, event.clientY);
          setVoiceAnchor(next);
          if (!movedRef.current) toggleVoice();
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
          setDragging(false);
        }}
      >
        <VoiceOrb
          active={voiceActive}
          as="div"
          size={ORB_SIZE}
          className={dragging ? "cursor-grabbing" : "cursor-grab"}
          label={voiceActive ? "Hide orb" : "Show orb"}
        />
      </div>
    </div>
  );
}
