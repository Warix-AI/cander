/**
 * Cross-client notification types — portable target + prefs + endpoints.
 */

export type NotificationClientType =
  | "capacitor_ios"
  | "capacitor_android"
  | "electron"
  | "web";

export type NotificationEndpointType =
  | "apns"
  | "fcm"
  | "web_push"
  | "realtime_session";

export type NotificationChannel =
  | "mobile_push"
  | "electron_notification"
  | "web_push"
  | "in_app";

export type NotificationDeliveryStatus =
  | "pending"
  | "sent"
  | "failed"
  | "suppressed";

/** Portable open target — every client understands these fields. */
export type NotificationTarget = {
  connector?: string | null;
  connectionId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  route?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreateNotificationInput = {
  profileId: string;
  workspaceId: string;
  type: string;
  title: string;
  body: string;
  connector?: string | null;
  connectionId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  route?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
};

export type NotificationRecord = {
  id: string;
  profileId: string;
  workspaceId: string;
  type: string;
  title: string;
  body: string;
  connector: string | null;
  connectionId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  route: string | null;
  metadata: Record<string, unknown>;
  dedupeKey: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationEndpoint = {
  id: string;
  profileId: string;
  clientType: NotificationClientType;
  endpointType: NotificationEndpointType;
  deviceId: string;
  pushToken: string | null;
  pushSubscription: Record<string, unknown> | null;
  appVersion: string | null;
  environment: "development" | "production";
  enabled: boolean;
  lastSeenAt: string;
};

export type NotificationChannelPrefs = Partial<
  Record<NotificationChannel, boolean>
>;

export type NotificationPreferences = {
  global_enabled: boolean;
  channels: NotificationChannelPrefs;
  types: Record<string, boolean>;
  connectors: Record<string, boolean>;
  connections: Record<
    string,
    { enabled?: boolean; channels?: NotificationChannelPrefs }
  >;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  global_enabled: true,
  channels: {
    mobile_push: true,
    electron_notification: true,
    web_push: false,
    in_app: true,
  },
  types: {
    "connector.gmail.new_email": true,
  },
  connectors: {},
  connections: {},
};

export const GMAIL_NEW_EMAIL_TYPE = "connector.gmail.new_email";
