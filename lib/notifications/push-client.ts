/**
 * Capacitor push registration — intentional permission + endpoint upsert.
 */

"use client";

import { getMobilePlatform, isMobileShell } from "@/lib/mobile-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  NotificationClientType,
  NotificationTarget,
} from "./types.ts";
import { parseNotifyDeepLink } from "./resolve-notification-route.ts";

const DEVICE_ID_KEY = "cander:push-device-id:v1";

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "unknown";
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing?.trim()) return existing.trim();
    const id = `cap_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `cap_${Date.now()}`;
  }
}

async function bearerHeaders(): Promise<HeadersInit | null> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function registerEndpoint(opts: {
  clientType: NotificationClientType;
  endpointType: "apns" | "fcm";
  pushToken: string;
}) {
  const headers = await bearerHeaders();
  if (!headers) return;
  await fetch("/api/notifications/endpoints", {
    method: "POST",
    headers,
    body: JSON.stringify({
      clientType: opts.clientType,
      endpointType: opts.endpointType,
      deviceId: getOrCreateDeviceId(),
      pushToken: opts.pushToken,
      environment:
        process.env.NODE_ENV === "development" ? "development" : "production",
      appVersion: "capacitor",
      enabled: true,
    }),
  });
}

type PushPlugin = {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (
    event: string,
    cb: (payload: Record<string, unknown>) => void,
  ) => Promise<{ remove: () => void }>;
  getDeliveredNotifications?: () => Promise<{ notifications: unknown[] }>;
};

async function loadPushPlugin(): Promise<PushPlugin | null> {
  if (!isMobileShell()) return null;
  try {
    const mod = await import("@capacitor/push-notifications");
    return mod.PushNotifications as unknown as PushPlugin;
  } catch {
    return null;
  }
}

export type PushTapHandler = (target: NotificationTarget) => void;

let listenersArmed = false;
let tapHandler: PushTapHandler | null = null;

export function setPushNotificationTapHandler(handler: PushTapHandler | null) {
  tapHandler = handler;
}

function targetFromPushPayload(payload: Record<string, unknown>): NotificationTarget | null {
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;
  const url =
    (typeof data.url === "string" && data.url) ||
    (typeof payload.url === "string" && payload.url) ||
    "";
  if (url.startsWith("cander://")) {
    return parseNotifyDeepLink(url);
  }
  const connector =
    typeof data.connector === "string" ? data.connector : null;
  if (!connector) return null;
  return {
    connector,
    connectionId:
      typeof data.connectionId === "string" ? data.connectionId : null,
    resourceType:
      typeof data.resourceType === "string" ? data.resourceType : null,
    resourceId: typeof data.resourceId === "string" ? data.resourceId : null,
    route: typeof data.route === "string" ? data.route : null,
    metadata: {
      messageId: data.messageId,
      threadId: data.threadId,
      notificationId: data.notificationId,
    },
  };
}

/** Arm OS listeners once (no permission prompt). */
export async function armPushNotificationListeners(): Promise<void> {
  if (listenersArmed || !isMobileShell()) return;
  const Push = await loadPushPlugin();
  if (!Push) return;
  listenersArmed = true;

  await Push.addListener("registration", (token) => {
    const value = typeof token.value === "string" ? token.value : "";
    if (!value) return;
    const platform = getMobilePlatform();
    const clientType: NotificationClientType =
      platform === "ios" ? "capacitor_ios" : "capacitor_android";
    const endpointType = platform === "ios" ? "apns" : "fcm";
    void registerEndpoint({ clientType, endpointType, pushToken: value });
  });

  await Push.addListener("registrationError", (err) => {
    console.warn("[push] registrationError", err);
  });

  await Push.addListener("pushNotificationReceived", () => {
    // Foreground: Realtime / in-app center handles UX — avoid duplicate banners.
  });

  await Push.addListener("pushNotificationActionPerformed", (event) => {
    const notification =
      event.notification && typeof event.notification === "object"
        ? (event.notification as Record<string, unknown>)
        : {};
    const target = targetFromPushPayload(notification);
    if (target && tapHandler) tapHandler(target);
  });
}

/**
 * Explicit user gesture: request permission and register for push.
 * Never call automatically on cold start.
 */
export async function requestPushPermissionAndRegister(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!isMobileShell()) {
    return { ok: false, reason: "Not a Capacitor shell." };
  }
  const Push = await loadPushPlugin();
  if (!Push) {
    return { ok: false, reason: "Push plugin not installed." };
  }
  await armPushNotificationListeners();
  let perm = await Push.checkPermissions();
  if (perm.receive !== "granted") {
    perm = await Push.requestPermissions();
  }
  if (perm.receive !== "granted") {
    return { ok: false, reason: "Permission denied." };
  }
  await Push.register();
  return { ok: true };
}

export async function isPushPermissionGranted(): Promise<boolean> {
  const Push = await loadPushPlugin();
  if (!Push) return false;
  const perm = await Push.checkPermissions();
  return perm.receive === "granted";
}
