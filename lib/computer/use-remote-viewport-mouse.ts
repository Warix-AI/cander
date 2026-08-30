"use client";

import { useCallback, useRef } from "react";
import type { ControlMode } from "@/lib/computer/computer-provider";

const DRAG_THRESHOLD_PX = 4;

type MouseInputPayload = Record<string, unknown>;

type UseRemoteViewportMouseOptions = {
  controlMode: ControlMode;
  sessionId: string;
  mapCoordinates: (clientX: number, clientY: number) => { x: number; y: number };
  sendInput: (
    sessionId: string,
    payload: MouseInputPayload,
  ) => Promise<{ ok: boolean; error?: string }>;
  setInputError: (message: string | null) => void;
};

function mouseEvent(
  eventType: "mouseMoved" | "mousePressed" | "mouseReleased",
  x: number,
  y: number,
): MouseInputPayload {
  return {
    type: "input_mouse",
    eventType,
    x: Math.round(x),
    y: Math.round(y),
    button: eventType === "mouseMoved" ? "none" : "left",
    // Match agent-browser dashboard: clickCount only on press.
    clickCount: eventType === "mousePressed" ? 1 : 0,
  };
}

export function useRemoteViewportMouse({
  controlMode,
  sessionId,
  mapCoordinates,
  sendInput,
  setInputError,
}: UseRemoteViewportMouseOptions) {
  const dragStateRef = useRef<{
    sentPress: boolean;
    startX: number;
    startY: number;
  } | null>(null);

  const deliverInput = useCallback(
    async (payload: MouseInputPayload) => {
      if (controlMode !== "user") {
        setInputError("Take control before clicking the viewport.");
        return false;
      }
      const result = await sendInput(sessionId, payload);
      if (!result.ok) {
        setInputError(result.error ?? "Click was not delivered.");
        return false;
      }
      setInputError(null);
      return true;
    },
    [controlMode, sendInput, sessionId, setInputError],
  );

  const onMouseDown = useCallback(
    (event: React.MouseEvent<HTMLImageElement>) => {
      if (event.button !== 0) {
        return;
      }
      dragStateRef.current = {
        sentPress: false,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [],
  );

  const onMouseMove = useCallback(
    (event: React.MouseEvent<HTMLImageElement>) => {
      const state = dragStateRef.current;
      if (!state || state.sentPress || controlMode !== "user") {
        return;
      }
      const dx = Math.abs(event.clientX - state.startX);
      const dy = Math.abs(event.clientY - state.startY);
      if (dx <= DRAG_THRESHOLD_PX && dy <= DRAG_THRESHOLD_PX) {
        return;
      }
      state.sentPress = true;
      const { x, y } = mapCoordinates(state.startX, state.startY);
      void deliverInput({
        type: "input_batch",
        events: [mouseEvent("mouseMoved", x, y), mouseEvent("mousePressed", x, y)],
      });
    },
    [controlMode, deliverInput, mapCoordinates],
  );

  const onMouseUp = useCallback(
    (event: React.MouseEvent<HTMLImageElement>) => {
      const state = dragStateRef.current;
      dragStateRef.current = null;
      if (!state || event.button !== 0) {
        return;
      }

      const start = mapCoordinates(state.startX, state.startY);
      const end = mapCoordinates(event.clientX, event.clientY);

      if (state.sentPress) {
        void deliverInput({
          type: "input_batch",
          events: [mouseEvent("mouseReleased", end.x, end.y)],
        });
        return;
      }

      // Simple click: move → press → release in one request (CLI path collapses this).
      // #region agent log
      fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'B_D',location:'use-remote-viewport-mouse.ts:mouseup',message:'client click mapped',data:{sessionId,controlMode,start,end,client:{sx:state.startX,sy:state.startY,ex:event.clientX,ey:event.clientY}},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      void deliverInput({
        type: "input_batch",
        events: [
          mouseEvent("mouseMoved", start.x, start.y),
          mouseEvent("mousePressed", start.x, start.y),
          mouseEvent("mouseReleased", end.x, end.y),
        ],
      });
    },
    [controlMode, deliverInput, mapCoordinates, sessionId],
  );

  return { onMouseDown, onMouseMove, onMouseUp };
}
