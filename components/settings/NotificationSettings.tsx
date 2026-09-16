"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  SettingsFootnote,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsChrome";
import { isDesktopShell } from "@/lib/desktop-shell";
import { isMobileShell } from "@/lib/mobile-shell";
import {
  getNotificationsServerSnapshot,
  getNotificationsSnapshot,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotifications,
} from "@/lib/notifications/notification-sync";
import { requestPushPermissionAndRegister } from "@/lib/notifications/push-client";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/lib/notifications/types";
import { normalizeNotificationPreferences } from "@/lib/notifications/preferences";
import { notificationToTarget } from "@/lib/notifications/resolve-notification-route";
import { registerWebPushSubscription } from "@/lib/notifications/web-push-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { setPendingConnectorFocus } from "@/lib/notifications/pending-connector-focus";
import { resolveNotificationRoute } from "@/lib/notifications/resolve-notification-route";

async function authHeaders(): Promise<HeadersInit | null> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function NotificationSettings() {
  const { openConnector } = useApp();
  const { items, unreadCount } = useSyncExternalStore(
    subscribeNotifications,
    getNotificationsSnapshot,
    getNotificationsServerSnapshot,
  );
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch("/api/notifications/preferences", { headers });
      if (!res.ok) return;
      const json = (await res.json()) as { prefs?: unknown };
      setPrefs(normalizeNotificationPreferences(json.prefs));
    })();
  }, []);

  const savePrefs = async (next: NotificationPreferences) => {
    setPrefs(next);
    setBusy(true);
    setStatus(null);
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error("Sign in required.");
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ prefs: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || "Could not save preferences.",
        );
      }
      setStatus("Saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const enableDevicePush = async () => {
    setBusy(true);
    setStatus(null);
    try {
      if (isMobileShell()) {
        const result = await requestPushPermissionAndRegister();
        if (!result.ok) throw new Error(result.reason || "Permission failed.");
        setStatus("Mobile push enabled.");
      } else if (!isDesktopShell()) {
        const result = await registerWebPushSubscription();
        if (!result.ok) throw new Error(result.reason || "Web Push failed.");
        setStatus("Web push enabled.");
      } else {
        setStatus("Desktop alerts use the live session (already on).");
      }
      await savePrefs({
        ...prefs,
        global_enabled: true,
        channels: {
          ...prefs.channels,
          mobile_push: true,
          in_app: true,
          electron_notification: true,
          web_push: !isDesktopShell() && !isMobileShell()
            ? true
            : prefs.channels.web_push,
        },
      });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Enable failed.");
    } finally {
      setBusy(false);
    }
  };

  const openItem = async (id: string) => {
    const item = items.find((n) => n.id === id);
    if (!item) return;
    await markNotificationRead(id);
    const target = notificationToTarget(item);
    const resolved = resolveNotificationRoute(target);
    if (resolved.kind === "connector") {
      setPendingConnectorFocus({
        connectorId: resolved.connectorId,
        connectionId: resolved.focus.connectionId,
        messageId: resolved.focus.messageId,
        threadId: resolved.focus.threadId,
      });
      openConnector(resolved.connectorId, resolved.focus);
    }
  };

  return (
    <SettingsPage>
      <SettingsSection title="Notifications">
        <SettingsGroup>
          <label className="flex items-center justify-between gap-3 px-1 py-2 text-[13px]">
            <span>Enable notifications</span>
            <input
              type="checkbox"
              checked={prefs.global_enabled}
              disabled={busy}
              onChange={(e) =>
                void savePrefs({ ...prefs, global_enabled: e.target.checked })
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3 px-1 py-2 text-[13px]">
            <span>Gmail — new email</span>
            <input
              type="checkbox"
              checked={prefs.types["connector.gmail.new_email"] !== false}
              disabled={busy || !prefs.global_enabled}
              onChange={(e) =>
                void savePrefs({
                  ...prefs,
                  types: {
                    ...prefs.types,
                    "connector.gmail.new_email": e.target.checked,
                  },
                })
              }
            />
          </label>
          <div className="flex flex-wrap gap-2 px-1 py-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void enableDevicePush()}
              className="rounded-[10px] bg-foreground px-3 py-1.5 text-[12px] font-medium text-background disabled:opacity-50"
            >
              {isMobileShell()
                ? "Enable device push"
                : isDesktopShell()
                  ? "Confirm desktop alerts"
                  : "Enable browser push"}
            </button>
            {status ? (
              <span className="text-[12px] text-muted-foreground">{status}</span>
            ) : null}
          </div>
        </SettingsGroup>
        <SettingsFootnote>
          One notification history across phone, desktop, and web. Delivery
          uses native push on mobile, desktop alerts in Electron, and Web Push
          when the browser tab is closed.
        </SettingsFootnote>
      </SettingsSection>

      <SettingsSection
        title={
          unreadCount > 0 ? `Inbox (${unreadCount} unread)` : "Inbox"
        }
      >
        <SettingsGroup>
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-[12px] text-muted-foreground">
              Shared across all your devices
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
              onClick={() => void markAllNotificationsRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.8} />
              Mark all read
            </button>
          </div>
          {items.length === 0 ? (
            <div className="flex items-center gap-2 px-1 py-4 text-[13px] text-muted-foreground">
              <Bell className="h-4 w-4" strokeWidth={1.6} />
              No notifications yet.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {items.slice(0, 40).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void openItem(n.id)}
                    className="flex w-full flex-col gap-0.5 px-1 py-2.5 text-left hover:bg-muted/50"
                  >
                    <span
                      className={`text-[13px] ${n.readAt ? "text-muted-foreground" : "font-medium"}`}
                    >
                      {n.title}
                    </span>
                    <span className="line-clamp-2 text-[12px] text-muted-foreground">
                      {n.body}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  );
}
