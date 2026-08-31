/**
 * Native capability types — shared DeviceCapabilities + availability.
 * Device facts inform the capability compiler; do not dump into every FM prompt.
 */

export type NativePlatform = "ios" | "android" | "electron" | "web";

export type AvailabilityReason =
  | "unsupported_platform"
  | "permission_required"
  | "not_installed"
  | "feature_disabled";

export type AvailabilityResult = {
  available: boolean;
  reason?: AvailabilityReason;
  /** User-facing hint when unavailable. */
  message?: string;
};

export type DeviceCapabilities = {
  platform: NativePlatform;
  isNative: boolean;
  camera: AvailabilityResult;
  photoLibrary: AvailabilityResult;
  files: AvailabilityResult;
  share: AvailabilityResult;
  haptics: AvailabilityResult;
  healthKit: AvailabilityResult;
  notifications: AvailabilityResult;
  screenCapture: AvailabilityResult;
  globalShortcut: AvailabilityResult;
  tray: AvailabilityResult;
  localModel: AvailabilityResult;
  network: AvailabilityResult;
};

export type NativePickedFile = {
  name: string;
  mime: string;
  size: number;
  /** Prefer bytes in memory when already loaded. */
  bytes?: ArrayBuffer | Uint8Array;
  /** Browser File / Blob when available. */
  blob?: Blob;
  /**
   * Electron main-process authorized path handle only —
   * never a renderer-invented path.
   */
  authorizedPathHandle?: string;
  dataUrl?: string;
};

export type CapImagePickResult =
  | { ok: true; image: import("../types.ts").ChatImageAttachment }
  | { ok: false; message: string; cancelled?: boolean };

export type HapticEvent = "send" | "select" | "success" | "warning";

export type HealthQueryOutcome =
  | "unavailable"
  | "not_requested"
  | "request_completed"
  | "succeeded_with_data"
  | "succeeded_no_visible_data"
  | "failed";

export type HealthMetric =
  | "steps"
  | "workouts"
  | "activeEnergy"
  | "restingHeartRate"
  | "sleep";

export type HealthConnectorState = {
  available: boolean;
  authorizationRequestCompleted: boolean;
  requestedTypes: HealthMetric[];
  earliestAuthorizedDates?: Partial<Record<HealthMetric, string>>;
};

export type HealthMetricResult = {
  metric: HealthMetric | "stepCount" | string;
  period: { start: string; end: string };
  value: number | null;
  unit: string;
  sampleCount: number;
  coverage: "available" | "none_visible";
  outcome: HealthQueryOutcome;
  error?: string;
};

export type HealthWorkoutSummary = {
  id: string;
  activityType: string;
  start: string;
  end: string;
  durationMinutes: number;
  activeEnergyKcal?: number;
};

export type ScreenCaptureTarget = "display" | "window" | "browser_viewport";
