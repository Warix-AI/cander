"use client";

import { useEffect } from "react";
import { useApp } from "@/components/app/AppProvider";
import { isDesktopShell } from "@/lib/desktop-shell";
import { isMobileShell } from "@/lib/mobile-shell";
import { setPendingConnectorFocus } from "@/lib/notifications/pending-connector-focus";
import {
  onNotificationInsert,
  type NotificationInsertHandler,
} from "@/lib/notifications/notification-sync";
import {
  armPushNotificationListeners,
  setPushNotificationTapHandler,
} from "@/lib/notifications/push-client";
import {
  parseNotifyDeepLink,
  resolveNotificationRoute,
} from "@/lib/notifications/resolve-notification-route";
import type { NotificationRecord } from "@/lib/notifications/types";
import { getActiveConnectorAccountId } from "@/lib/connector-active-account";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Cross-client notification listeners: Capacitor push taps, deep links,
 * Electron OS notifications, and Realtime inserts.
 */
export function NotificationListener() {
  const { openConnector, connectorId, workspaceId } = useApp();

  useEffect(() => {
    const navigateFromTarget = (raw: {
      connector?: string | null;
      connectionId?: string | null;
      resourceType?: string | null;
      resourceId?: string | null;
      route?: string | null;
      metadata?: Record<string, unknown>;
    }) => {
      const resolved = resolveNotificationRoute(raw);
      if (resolved.kind === "none") return;
      if (resolved.kind === "fallback") {
        if (resolved.connectorId) openConnector(resolved.connectorId);
        return;
      }
      setPendingConnectorFocus({
        connectorId: resolved.connectorId,
        connectionId: resolved.focus.connectionId,
        messageId: resolved.focus.messageId,
        threadId: resolved.focus.threadId,
      });
      openConnector(resolved.connectorId, {
        connectionId: resolved.focus.connectionId,
        messageId: resolved.focus.messageId,
        threadId: resolved.focus.threadId,
      });
    };

    setPushNotificationTapHandler((target) => navigateFromTarget(target));
    void armPushNotificationListeners();

    const onAppUrl = (url: string) => {
      const target = parseNotifyDeepLink(url);
      if (target) navigateFromTarget(target);
    };

    let removeAppListener: (() => void) | undefined;
    if (isMobileShell()) {
      void import("@capacitor/app").then(({ App }) => {
        void App.addListener("appUrlOpen", (event) => {
          onAppUrl(event.url);
        }).then((handle) => {
          removeAppListener = () => handle.remove();
        });
        void App.getLaunchUrl?.().then((result) => {
          if (result?.url) onAppUrl(result.url);
        });
      });
    }

    const desktop = (
      window as unknown as {
        canderDesktop?: {
          notifications?: {
            show: (opts: {
              title: string;
              body: string;
              data?: Record<string, string>;
            }) => Promise<void>;
            onClick: (
              handler: (data: Record<string, string>) => void,
            ) => () => void;
          };
          shell?: {
            showMainWindow?: () => void;
          };
        };
      }
    ).canderDesktop;

    let stopDesktopClick: (() => void) | undefined;
    if (isDesktopShell() && desktop?.notifications) {
      stopDesktopClick = desktop.notifications.onClick((data) => {
        desktop.shell?.showMainWindow?.();
        navigateFromTarget({
          connector: data.connector,
          connectionId: data.connectionId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          route: data.route,
          metadata: {
            messageId: data.messageId,
            threadId: data.threadId,
            notificationId: data.notificationId,
          },
        });
      });

      // Register lightweight electron endpoint for preference scoping.
      void (async () => {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        let deviceId = localStorage.getItem("cander:electron-device-id:v1");
        if (!deviceId) {
          deviceId = `el_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
          localStorage.setItem("cander:electron-device-id:v1", deviceId);
        }
        await fetch("/api/notifications/endpoints", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clientType: "electron",
            endpointType: "realtime_session",
            deviceId,
            enabled: true,
          }),
        });
      })();
    }

    const onInsert: NotificationInsertHandler = (n: NotificationRecord) => {
      if (!isDesktopShell() || !desktop?.notifications?.show) return;
      if (document.visibilityState === "visible" && document.hasFocus()) {
        const activeConn = getActiveConnectorAccountId(
          workspaceId,
          n.connector ?? "",
        );
        if (
          n.connector &&
          connectorId === n.connector &&
          (!n.connectionId || n.connectionId === activeConn)
        ) {
          return;
        }
      }
      void desktop.notifications.show({
        title: n.title,
        body: n.body,
        data: {
          notificationId: n.id,
          type: n.type,
          connector: n.connector ?? "",
          connectionId: n.connectionId ?? "",
          resourceType: n.resourceType ?? "",
          resourceId: n.resourceId ?? "",
          route: n.route ?? "",
          messageId: String(n.metadata?.messageId ?? ""),
          threadId: String(n.metadata?.threadId ?? ""),
        },
      });
    };
    const stopInsert = onNotificationInsert(onInsert);

    const onSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== "cander:notify") return;
      const d = data.data || {};
      navigateFromTarget({
        connector: d.connector,
        connectionId: d.connectionId,
        resourceType: d.resourceType,
        resourceId: d.resourceId,
        route: d.route,
        metadata: {
          messageId: d.messageId,
          threadId: d.threadId,
          notificationId: d.notificationId,
        },
      });
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    // Web: open from ?notify= query after SW click.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("notify") === "1") {
        navigateFromTarget({
          connector: url.searchParams.get("connector"),
          connectionId: url.searchParams.get("connectionId"),
          resourceType: url.searchParams.get("resourceType"),
          resourceId: url.searchParams.get("resourceId"),
          metadata: {
            messageId: url.searchParams.get("messageId"),
            threadId: url.searchParams.get("threadId"),
          },
        });
        url.searchParams.delete("notify");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    } catch {
      /* ignore */
    }

    return () => {
      setPushNotificationTapHandler(null);
      removeAppListener?.();
      stopDesktopClick?.();
      stopInsert();
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, [openConnector, connectorId, workspaceId]);

  return null;
}
