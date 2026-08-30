export type ControlMode = "agent" | "user" | "paused";

export type StreamConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type BrowserObservation = {
  url: string;
  title: string;
  snapshot: string;
  interactiveElements?: string[];
};

export type StreamFrameMessage = {
  type: "frame";
  data: string;
  metadata?: {
    deviceWidth?: number;
    deviceHeight?: number;
    pageScaleFactor?: number;
    offsetTop?: number;
    scrollOffsetX?: number;
    scrollOffsetY?: number;
  };
};
