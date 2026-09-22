"use client";

import { useSyncExternalStore } from "react";
import { Bell, CircleHelp } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { SHELL_ICON_CLASS, SHELL_ICON_PX } from "@/components/brand/NavIcons";
import { NavToggle } from "@/components/shell/NavToggle";
import { VoiceWaveIcon } from "@/components/shell/VoiceOrb";
import {
  SHELL_HEADER_ICON_CLASS,
  ShellWindowChromeBar,
} from "@/components/shell/ShellWindowChromeBar";
import {
  getNotificationsServerSnapshot,
  getNotificationsSnapshot,
  subscribeNotifications,
} from "@/lib/notifications/notification-sync";
import { DESKTOP_NO_DRAG, useDesktopShell } from "@/lib/desktop-shell";
import { cn } from "@/lib/utils";

export function WindowChrome({
  clearTrafficLights = false,
  hideHistory = false,
  /**
   * Two-layer desktop nav: PanelLeft + Search + Voice in the titlebar.
   * Notifications live on the icon rail; Help under General.
   */
  navChrome = false,
  className,
}: {
  /** Pad past macOS traffic lights when chrome shares their row. */
  clearTrafficLights?: boolean;
  /** Hide header actions (e.g. floating sidebar peek over project tabs). */
  hideHistory?: boolean;
  navChrome?: boolean;
  className?: string;
}) {
  const {
    openSearch,
    openVoice,
    openNotifications,
    openHelp,
    entitlements,
    view,
  } = useApp();
  const desktop = useDesktopShell();
  const { unreadCount } = useSyncExternalStore(
    subscribeNotifications,
    getNotificationsSnapshot,
    getNotificationsServerSnapshot,
  );

  if (navChrome) {
    return (
      <ShellWindowChromeBar
        clearTrafficLights={clearTrafficLights}
        className={className}
        leading={<NavToggle />}
        onSearch={() => openSearch()}
        searchActive={view === "search"}
        afterSearch={
          entitlements.hasVoice ? (
            <button
              type="button"
              aria-label="Voice"
              title="Voice"
              style={desktop ? DESKTOP_NO_DRAG : undefined}
              onClick={() => openVoice()}
              className={cn(
                SHELL_HEADER_ICON_CLASS,
                view === "voice" && "shell-rail-icon-active",
              )}
            >
              <VoiceWaveIcon size={SHELL_ICON_PX} />
            </button>
          ) : null
        }
      />
    );
  }

  return (
    <ShellWindowChromeBar
      clearTrafficLights={clearTrafficLights}
      hideHistory={hideHistory}
      className={className}
      onSearch={() => openSearch()}
      afterSearch={
        <>
          <button
            type="button"
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
            style={desktop ? DESKTOP_NO_DRAG : undefined}
            onClick={() => openNotifications()}
            className={cn(SHELL_HEADER_ICON_CLASS, "relative")}
          >
            <Bell className={SHELL_ICON_CLASS} strokeWidth={1.75} />
            {unreadCount > 0 ? (
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#0b4fc4]"
              />
            ) : null}
          </button>
          <button
            type="button"
            aria-label="Help"
            style={desktop ? DESKTOP_NO_DRAG : undefined}
            onClick={() => openHelp()}
            className={SHELL_HEADER_ICON_CLASS}
          >
            <CircleHelp className={SHELL_ICON_CLASS} strokeWidth={1.75} />
          </button>
        </>
      }
    />
  );
}
