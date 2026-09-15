/**
 * Web Push subscription helpers (closed-tab delivery).
 */

"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isDesktopShell } from "@/lib/desktop-shell";
import { isMobileShell } from "@/lib/mobile-shell";

const DEVICE_ID_KEY = "cander:web-push-device-id:v1";

function getOrCreateWebDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing?.trim()) return existing.trim();
    const id = `web_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `web_${Date.now()}`;
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerWebPushSubscription(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "No window." };
  }
  if (isMobileShell() || isDesktopShell()) {
    return { ok: false, reason: "Use native push on this shell." };
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "Web Push not supported." };
  }

  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) {
    return { ok: false, reason: "VAPID public key not configured." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Permission denied." };
  }

  const reg = await navigator.serviceWorker.register("/sw-push.js");
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, reason: "Not signed in." };

  const json = sub.toJSON();
  const res = await fetch("/api/notifications/endpoints", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientType: "web",
      endpointType: "web_push",
      deviceId: getOrCreateWebDeviceId(),
      pushSubscription: json,
      enabled: true,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return {
      ok: false,
      reason: (err as { error?: string }).error || "Register failed.",
    };
  }
  return { ok: true };
}
