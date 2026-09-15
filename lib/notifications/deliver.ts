/**
 * Delivery router — fans one notification record out to enabled endpoints.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  channelAllowed,
  normalizeNotificationPreferences,
} from "./preferences.ts";
import {
  getApnsProvider,
  getFcmProvider,
  getWebPushProvider,
} from "./push-providers.ts";
import { buildNotifyDeepLink, notificationToTarget } from "./resolve-notification-route.ts";
import type {
  NotificationChannel,
  NotificationEndpoint,
  NotificationRecord,
} from "./types.ts";

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function mapEndpoint(row: Record<string, unknown>): NotificationEndpoint {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    clientType: row.client_type as NotificationEndpoint["clientType"],
    endpointType: row.endpoint_type as NotificationEndpoint["endpointType"],
    deviceId: String(row.device_id),
    pushToken: typeof row.push_token === "string" ? row.push_token : null,
    pushSubscription:
      row.push_subscription && typeof row.push_subscription === "object"
        ? (row.push_subscription as Record<string, unknown>)
        : null,
    appVersion: typeof row.app_version === "string" ? row.app_version : null,
    environment:
      row.environment === "development" ? "development" : "production",
    enabled: Boolean(row.enabled),
    lastSeenAt: String(row.last_seen_at ?? new Date().toISOString()),
  };
}

async function recordDelivery(opts: {
  notificationId: string;
  endpointId: string | null;
  channel: NotificationChannel;
  status: "sent" | "failed" | "suppressed";
  error?: string;
}) {
  const admin = createSupabaseAdminClient();
  const id = newId("nd");
  const now = new Date().toISOString();
  const { error } = await admin.from("notification_deliveries").insert({
    id,
    notification_id: opts.notificationId,
    endpoint_id: opts.endpointId,
    channel: opts.channel,
    status: opts.status,
    attempted_at: now,
    delivered_at: opts.status === "sent" ? now : null,
    error: opts.error ?? null,
  });
  if (error && !/duplicate|unique/i.test(error.message)) {
    console.warn("[notifications] delivery insert failed", error.message);
  }
}

async function alreadyDelivered(
  notificationId: string,
  endpointId: string | null,
  channel: NotificationChannel,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  let q = admin
    .from("notification_deliveries")
    .select("id")
    .eq("notification_id", notificationId)
    .eq("channel", channel)
    .eq("status", "sent")
    .limit(1);
  if (endpointId) q = q.eq("endpoint_id", endpointId);
  else q = q.is("endpoint_id", null);
  const { data } = await q.maybeSingle();
  return Boolean(data?.id);
}

async function disableEndpoint(endpointId: string) {
  const admin = createSupabaseAdminClient();
  await admin
    .from("notification_endpoints")
    .update({ enabled: false })
    .eq("id", endpointId);
}

function pushData(notification: NotificationRecord): Record<string, string> {
  return {
    notificationId: notification.id,
    type: notification.type,
    connector: notification.connector ?? "",
    connectionId: notification.connectionId ?? "",
    resourceType: notification.resourceType ?? "",
    resourceId: notification.resourceId ?? "",
    route: notification.route ?? "",
  };
}

/**
 * Route a persisted notification to all appropriate delivery channels.
 * Soft-fails — never throws to callers.
 */
export async function deliverNotification(
  notification: NotificationRecord,
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();

    const { data: prefRow } = await admin
      .from("notification_preferences")
      .select("prefs")
      .eq("profile_id", notification.profileId)
      .maybeSingle();
    const prefs = normalizeNotificationPreferences(prefRow?.prefs);

    // in_app: Realtime on the notifications row is the transport.
    if (channelAllowed(prefs, "in_app", notification)) {
      if (!(await alreadyDelivered(notification.id, null, "in_app"))) {
        await recordDelivery({
          notificationId: notification.id,
          endpointId: null,
          channel: "in_app",
          status: "sent",
        });
      }
    } else {
      await recordDelivery({
        notificationId: notification.id,
        endpointId: null,
        channel: "in_app",
        status: "suppressed",
      });
    }

    const { data: endpointRows } = await admin
      .from("notification_endpoints")
      .select("*")
      .eq("profile_id", notification.profileId)
      .eq("enabled", true);

    const endpoints = (endpointRows ?? []).map((r) =>
      mapEndpoint(r as Record<string, unknown>),
    );
    const target = notificationToTarget(notification);
    const url = buildNotifyDeepLink(target);
    const payload = {
      title: notification.title,
      body: notification.body,
      data: pushData(notification),
      url,
    };

    for (const endpoint of endpoints) {
      // Electron OS toast is client-driven from Realtime; mark intent once.
      if (
        endpoint.clientType === "electron" &&
        channelAllowed(prefs, "electron_notification", notification)
      ) {
        if (
          !(await alreadyDelivered(
            notification.id,
            endpoint.id,
            "electron_notification",
          ))
        ) {
          await recordDelivery({
            notificationId: notification.id,
            endpointId: endpoint.id,
            channel: "electron_notification",
            status: "sent",
          });
        }
      }

      if (
        (endpoint.clientType === "capacitor_ios" ||
          endpoint.clientType === "capacitor_android") &&
        channelAllowed(prefs, "mobile_push", notification) &&
        endpoint.pushToken
      ) {
        if (
          await alreadyDelivered(notification.id, endpoint.id, "mobile_push")
        ) {
          continue;
        }
        const provider =
          endpoint.endpointType === "apns" ||
          endpoint.clientType === "capacitor_ios"
            ? getApnsProvider()
            : getFcmProvider();
        const result = await provider.send({
          token: endpoint.pushToken,
          environment: endpoint.environment,
          payload,
        });
        await recordDelivery({
          notificationId: notification.id,
          endpointId: endpoint.id,
          channel: "mobile_push",
          status: result.ok ? "sent" : "failed",
          error: result.ok ? undefined : result.error,
        });
        if (!result.ok && result.permanent) {
          await disableEndpoint(endpoint.id);
        }
      }

      if (
        endpoint.clientType === "web" &&
        endpoint.endpointType === "web_push" &&
        channelAllowed(prefs, "web_push", notification) &&
        endpoint.pushSubscription
      ) {
        if (await alreadyDelivered(notification.id, endpoint.id, "web_push")) {
          continue;
        }
        const result = await getWebPushProvider().send({
          subscription: endpoint.pushSubscription,
          payload,
        });
        await recordDelivery({
          notificationId: notification.id,
          endpointId: endpoint.id,
          channel: "web_push",
          status: result.ok ? "sent" : "failed",
          error: result.ok ? undefined : result.error,
        });
        if (!result.ok && result.permanent) {
          await disableEndpoint(endpoint.id);
        }
      }
    }
  } catch (err) {
    console.error(
      "[notifications] deliverNotification failed",
      err instanceof Error ? err.message : err,
    );
  }
}
