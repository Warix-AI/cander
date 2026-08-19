"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { VoiceOrb } from "@/components/shell/VoiceOrb";
import type { VoiceAnchor } from "@/lib/types";

const ORB_SIZE = 45;

function anchorPoint(anchor: VoiceAnchor) {
  const pad = 24;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
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
      return { x: pad + ORB_SIZE / 2, y: vh - pad - ORB_SIZE / 2 };
    case "bottom-center":
      return { x: vw / 2, y: vh - pad - ORB_SIZE / 2 };
    default:
      return { x: vw - pad - ORB_SIZE / 2, y: vh - pad - ORB_SIZE / 2 };
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
    <div className="mb-2 px-3">
      <VoiceOrb
        active={voiceActive}
        onClick={toggleVoice}
        size={38}
        label={voiceActive ? "Hide orb" : "Show orb"}
      />
    </div>
  );
}

export function FloatingVoiceDock() {
  const {
    voiceActive,
    voiceAnchor,
    toggleVoice,
    setVoiceAnchor,
    sidebarOpen,
    mobileNav,
    entitlements,
  } = useApp();
  const inSidebar = sidebarOpen || mobileNav;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const movedRef = useRef(false);
  const originRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);

  const settle = useCallback(() => anchorPoint(voiceAnchor), [voiceAnchor]);

  useEffect(() => {
    if (!dragging) setPos(null);
  }, [voiceAnchor, dragging]);

  if (inSidebar || !voiceActive || !entitlements.hasVoice) return null;

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
