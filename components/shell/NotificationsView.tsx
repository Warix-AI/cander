"use client";

import { useSyncExternalStore } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsChrome";
import {
  getNotificationsServerSnapshot,
  getNotificationsSnapshot,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotifications,
} from "@/lib/notifications/notification-sync";
import { setPendingConnectorFocus } from "@/lib/notifications/pending-connector-focus";
import {
  notificationToTarget,
  resolveNotificationRoute,
} from "@/lib/notifications/resolve-notification-route";
import { cn } from "@/lib/utils";

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Dedicated inbox for emails, expert updates, and other in-app alerts.
 * Preference controls stay under Settings → Notifications.
 */
export function NotificationsView() {
  const { openConnector } = useApp();
  const { items, unreadCount } = useSyncExternalStore(
    subscribeNotifications,
    getNotificationsSnapshot,
    getNotificationsServerSnapshot,
  );

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
      <SettingsHeader
        kicker="Inbox"
        title="Notifications"
        subtitle="Emails, expert updates, and other activity across your spaces."
        actions={
          items.length > 0 ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => void markAllNotificationsRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.8} />
              Mark all read
            </button>
          ) : null
        }
      />

      <SettingsSection
        title={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        className="mt-2 lg:mt-6"
      >
        <SettingsGroup>
          {items.length === 0 ? (
            <div className="flex flex-col items-start gap-2 px-1 py-8 text-muted-foreground">
              <Bell className="h-5 w-5" strokeWidth={1.6} />
              <p className="text-[14px]">No notifications yet.</p>
              <p className="max-w-sm text-[13px] leading-relaxed">
                New emails, expert results, and other updates will show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {items.slice(0, 80).map((n) => {
                const unread = !n.readAt;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => void openItem(n.id)}
                      className="flex w-full gap-3 px-1 py-3 text-left transition-colors hover:bg-muted/40"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          unread ? "bg-[#0b4fc4]" : "bg-transparent",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span
                            className={cn(
                              "truncate text-[14px] tracking-[-0.01em]",
                              unread
                                ? "font-medium text-foreground"
                                : "text-muted-foreground",
                            )}
                          >
                            {n.title}
                          </span>
                          <span className="shrink-0 text-[12px] text-muted-foreground">
                            {formatWhen(n.createdAt)}
                          </span>
                        </span>
                        {n.body ? (
                          <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                            {n.body}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  );
}
