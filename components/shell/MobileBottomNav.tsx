"use client";

import { useCallback, useState } from "react";
import {
  LayoutGrid,
  MessageSquarePlus,
  Pin,
  UserRound,
  Users,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { AccountAvatar } from "@/components/shell/AccountAvatar";
import { MobileNavSheet } from "@/components/shell/MobileNavSheet";
import { AccountSheet } from "@/components/shell/mobile/AccountSheet";
import { PinsSheet } from "@/components/shell/mobile/PinsSheet";
import { SpacesSheet } from "@/components/shell/mobile/SpacesSheet";
import { WorkspaceSheet } from "@/components/shell/mobile/WorkspaceSheet";
import {
  MOBILE_NAV_HEIGHT,
  MOBILE_NAV_INNER_HEIGHT,
  type MobileNavTabId,
  type MobileSheetId,
} from "@/lib/mobile-nav";
import { cn } from "@/lib/utils";

const courierTabs: {
  id: MobileNavTabId;
  label: string;
  Icon: typeof MessageSquarePlus;
  sheet?: MobileSheetId;
}[] = [
  { id: "chat", label: "Chat", Icon: MessageSquarePlus },
  { id: "spaces", label: "Spaces", Icon: LayoutGrid, sheet: "spaces" },
  { id: "pins", label: "Pins", Icon: Pin, sheet: "pins" },
  { id: "workspace", label: "Workspace", Icon: Users, sheet: "workspace" },
  { id: "account", label: "Account", Icon: UserRound },
];

const navTabClass = (active: boolean) =>
  cn(
    "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-colors duration-200",
    active
      ? "text-foreground"
      : "text-muted-foreground hover:text-foreground",
  );

export function MobileBottomNav() {
  const {
    view,
    spaceId,
    threadId,
    newChat,
    actor,
    entitlements,
  } = useApp();
  const [sheet, setSheet] = useState<MobileSheetId | null>(null);

  const closeSheet = useCallback(() => setSheet(null), []);

  const isOnChat = view === "chat" && !threadId && !spaceId;

  const chatActive =
    view !== "space" && view !== "recents" && view !== "settings";
  const spacesActive = view === "space" || view === "recents";
  const accountActive = view === "settings" || sheet === "account";

  const tabs = courierTabs.filter(
    (tab) => tab.id !== "workspace" || entitlements.hasWorkspaces,
  );

  const isCourierActive = (id: MobileNavTabId) => {
    if (id === "chat") return chatActive;
    if (id === "spaces") return spacesActive;
    if (id === "account") return accountActive;
    if (id === "pins") return sheet === "pins";
    if (id === "workspace") return sheet === "workspace";
    return false;
  };

  const handleCourierTab = (tab: (typeof courierTabs)[number]) => {
    if (tab.id === "chat") {
      closeSheet();
      if (!isOnChat) newChat();
      return;
    }
    if (tab.id === "account") {
      setSheet((current) => (current === "account" ? null : "account"));
      return;
    }
    if (!tab.sheet) return;
    setSheet((current) => (current === tab.sheet ? null : tab.sheet!));
  };

  return (
    <>
      <MobileNavSheet
        open={sheet === "spaces"}
        sheetId="spaces"
        onClose={closeSheet}
      >
        <SpacesSheet onSelect={closeSheet} />
      </MobileNavSheet>
      <MobileNavSheet
        open={sheet === "pins"}
        sheetId="pins"
        onClose={closeSheet}
      >
        <PinsSheet onSelect={closeSheet} />
      </MobileNavSheet>
      {entitlements.hasWorkspaces ? (
        <MobileNavSheet
          open={sheet === "workspace"}
          sheetId="workspace"
          onClose={closeSheet}
        >
          <WorkspaceSheet onSelect={closeSheet} />
        </MobileNavSheet>
      ) : null}
      <MobileNavSheet
        open={sheet === "account"}
        sheetId="account"
        onClose={closeSheet}
      >
        <AccountSheet onSelect={closeSheet} />
      </MobileNavSheet>

      <nav
        aria-label="Main"
        style={{
          height: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-md lg:hidden"
      >
        <div
          className="grid h-full w-full items-stretch px-2"
          style={{
            minHeight: MOBILE_NAV_INNER_HEIGHT,
            gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          }}
        >
          {tabs.map((tab) => {
            const active = isCourierActive(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={active ? "page" : undefined}
                aria-expanded={
                  tab.id === "account"
                    ? sheet === "account"
                    : tab.sheet
                      ? sheet === tab.sheet
                      : undefined
                }
                onClick={() => handleCourierTab(tab)}
                className={navTabClass(active)}
              >
                {tab.id === "account" ? (
                  <AccountAvatar
                    memberId={actor.id}
                    name={actor.name}
                    initials={actor.initials}
                    size="sm"
                    className={cn(
                      "rounded-full",
                      active && "ring-2 ring-foreground/20",
                    )}
                  />
                ) : (
                  <tab.Icon
                    className="h-5 w-5 shrink-0"
                    strokeWidth={active ? 2 : 1.6}
                  />
                )}
                <span className="w-full truncate text-center text-[10px] font-medium tracking-[-0.01em]">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
