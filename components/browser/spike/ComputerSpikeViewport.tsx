"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  openComputerSpikeStream,
  sendComputerSpikeInput,
} from "@/lib/api/computer-spike-client";
import { useRemoteViewportMouse } from "@/lib/computer/use-remote-viewport-mouse";
import type { ControlMode, StreamConnectionState } from "@/lib/computer/spike/types";

type ComputerSpikeViewportProps = {
  sessionId: string;
  controlMode: ControlMode;
  onConnectionStateChange?: (state: StreamConnectionState) => void;
};

export function ComputerSpikeViewport({
  sessionId,
  controlMode,
  onConnectionStateChange,
}: ComputerSpikeViewportProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const metadataRef = useRef<{ deviceWidth: number; deviceHeight: number }>({
    deviceWidth: 1280,
    deviceHeight: 720,
  });
  const [connectionState, setConnectionState] =
    useState<StreamConnectionState>("connecting");
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    const close = openComputerSpikeStream(sessionId, {
      onFrame: (frame) => {
        if (imgRef.current) {
          imgRef.current.src = `data:image/jpeg;base64,${frame.data}`;
        }
        if (frame.metadata?.deviceWidth && frame.metadata?.deviceHeight) {
          metadataRef.current = {
            deviceWidth: frame.metadata.deviceWidth,
            deviceHeight: frame.metadata.deviceHeight,
          };
        }
      },
      onStatus: (status) => {
        setConnectionState(status.connectionState);
        onConnectionStateChange?.(status.connectionState);
        if (status.connectionState === "connected") {
          setInputError(null);
        }
      },
    });
    return close;
  }, [sessionId, onConnectionStateChange]);

  const mapCoordinates = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) {
      return { x: 0, y: 0 };
    }
    const rect = img.getBoundingClientRect();
    const { deviceWidth, deviceHeight } = metadataRef.current;
    // Scale display → CSS viewport (same formula as agent-browser dashboard).
    // Prefer frame metadata device size; fall back to JPEG natural size if missing.
    const targetW = deviceWidth || img.naturalWidth || 1280;
    const targetH = deviceHeight || img.naturalHeight || 720;
    const mapped = {
      x: Math.round((clientX - rect.left) * (targetW / rect.width)),
      y: Math.round((clientY - rect.top) * (targetH / rect.height)),
    };
    // #region agent log
    fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'B',location:'ComputerSpikeViewport.tsx:mapCoordinates',message:'coord scale inputs',data:{clientX,clientY,rect:{w:rect.width,h:rect.height,l:rect.left,t:rect.top},natural:{w:img.naturalWidth,h:img.naturalHeight},device:{w:deviceWidth,h:deviceHeight},target:{w:targetW,h:targetH},mapped},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return mapped;
  }, []);

  const { onMouseDown, onMouseMove, onMouseUp } = useRemoteViewportMouse({
    controlMode,
    sessionId,
    mapCoordinates,
    sendInput: sendComputerSpikeInput,
    setInputError,
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (controlMode !== "user") {
      setInputError("Take control before typing into the viewport.");
      return;
    }
    event.preventDefault();
    void (async () => {
      const down = await sendComputerSpikeInput(sessionId, {
        type: "input_keyboard",
        eventType: "keyDown",
        key: event.key,
        code: event.code,
      });
      if (!down.ok) {
        setInputError(down.error ?? "Key input was not delivered.");
        return;
      }
      if (event.key.length === 1) {
        const typed = await sendComputerSpikeInput(sessionId, {
          type: "input_keyboard",
          eventType: "char",
          key: event.key,
          code: event.code,
        });
        if (!typed.ok) {
          setInputError(typed.error ?? "Key input was not delivered.");
          return;
        }
      }
      setInputError(null);
    })();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            connectionState === "connected"
              ? "bg-green-500"
              : connectionState === "reconnecting"
                ? "bg-yellow-500"
                : connectionState === "connecting"
                  ? "bg-blue-500"
                  : "bg-red-500"
          }`}
        />
        <span>{connectionState}</span>
        <span>·</span>
        <span>control: {controlMode}</span>
        {inputError ? (
          <span className="ml-auto max-w-[60%] truncate text-red-500" title={inputError}>
            {inputError}
          </span>
        ) : null}
      </div>
      <div
        className="relative flex flex-1 items-center justify-center overflow-auto bg-black"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          alt="Remote browser viewport"
          className="max-h-full max-w-full cursor-crosshair select-none"
          draggable={false}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
        />
      </div>
    </div>
  );
}
