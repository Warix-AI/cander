"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  openComputerStream,
  sendComputerInput,
  setComputerControlMode,
} from "@/lib/api/computer-client";
import type { ControlMode } from "@/lib/computer/computer-provider";
import type { StreamConnectionState } from "@/lib/computer/spike/types";
import { useRemoteViewportMouse } from "@/lib/computer/use-remote-viewport-mouse";

type ComputerBrowserViewportProps = {
  sessionId: string;
  controlMode: ControlMode;
  onConnectionStateChange?: (state: StreamConnectionState) => void;
  onTakeControl?: () => void;
  onGiveBack?: () => void;
};

export function ComputerBrowserViewport({
  sessionId,
  controlMode,
  onConnectionStateChange,
  onTakeControl,
  onGiveBack,
}: ComputerBrowserViewportProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const metadataRef = useRef({ deviceWidth: 1280, deviceHeight: 720 });
  const [connectionState, setConnectionState] =
    useState<StreamConnectionState>("connecting");
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    const close = openComputerStream(sessionId, {
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
    const targetW = deviceWidth || img.naturalWidth || 1280;
    const targetH = deviceHeight || img.naturalHeight || 720;
    return {
      x: Math.round((clientX - rect.left) * (targetW / rect.width)),
      y: Math.round((clientY - rect.top) * (targetH / rect.height)),
    };
  }, []);

  const { onMouseDown, onMouseMove, onMouseUp } = useRemoteViewportMouse({
    controlMode,
    sessionId,
    mapCoordinates,
    sendInput: sendComputerInput,
    setInputError,
  });

  const handleTakeControl = async () => {
    const result = await setComputerControlMode(sessionId, "user");
    if (!result.ok) {
      setInputError(result.error ?? "Take control failed — control_mode not persisted.");
      return;
    }
    setInputError(null);
    onTakeControl?.();
  };

  const handleGiveBack = async () => {
    const result = await setComputerControlMode(sessionId, "agent");
    if (!result.ok) {
      setInputError(result.error ?? "Give back failed — control_mode not persisted.");
      return;
    }
    setInputError(null);
    onGiveBack?.();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs">
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
        <span className="text-muted-foreground">{connectionState}</span>
        <span className="text-muted-foreground">· control: {controlMode}</span>
        {inputError ? (
          <span className="max-w-[40%] truncate text-red-500" title={inputError}>
            {inputError}
          </span>
        ) : null}
        <div className="ml-auto flex gap-2">
          {controlMode !== "user" ? (
            <button
              type="button"
              className="rounded-full border border-border px-2 py-0.5 text-[11px]"
              onClick={() => void handleTakeControl()}
            >
              Take control
            </button>
          ) : (
            <button
              type="button"
              className="rounded-full bg-foreground px-2 py-0.5 text-[11px] text-background"
              onClick={() => void handleGiveBack()}
            >
              Give back to Cander
            </button>
          )}
        </div>
      </div>
      <div
        className="relative flex flex-1 items-center justify-center overflow-auto bg-black"
        tabIndex={0}
        onKeyDown={(event) => {
          if (controlMode !== "user") {
            setInputError("Take control before typing into the viewport.");
            return;
          }
          event.preventDefault();
          void (async () => {
            const result = await sendComputerInput(sessionId, {
              type: "input_keyboard",
              eventType: "keyDown",
              key: event.key,
              code: event.code,
            });
            if (!result.ok) {
              setInputError(result.error ?? "Key input was not delivered.");
              return;
            }
            setInputError(null);
          })();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          alt="Remote browser"
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
