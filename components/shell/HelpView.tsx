"use client";

import {
  Layers,
  LayoutGrid,
  MessageSquare,
  Search,
  Zap,
} from "lucide-react";
import {
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsChrome";

const HELP_TOPICS = [
  {
    Icon: LayoutGrid,
    title: "Spaces",
    body: "Switch between the places you work. Each space keeps its own apps, experts, and chats so context stays separate.",
  },
  {
    Icon: Layers,
    title: "Apps",
    body: "Connect Gmail and other tools here. Open an app to browse mail, calendar, or whatever that connector handles.",
  },
  {
    Icon: Zap,
    title: "Experts",
    body: "Specialists you can add and run for focused work. Start one when you want help that goes beyond a normal chat.",
  },
  {
    Icon: MessageSquare,
    title: "Chats",
    body: "Your conversations live here. Start a new chat anytime from the bottom of the menu, or reopen one from this list.",
  },
  {
    Icon: Search,
    title: "Search & alerts",
    body: "Use Search next to the panel toggle to jump anywhere fast. The bell opens your inbox for emails, expert updates, and other activity.",
  },
] as const;

/**
 * Lightweight onboarding / help surface opened from the header help control.
 */
export function HelpView() {
  return (
    <SettingsPage>
      <SettingsHeader
        kicker="Guide"
        title="Help"
        subtitle="A short tour of the menu and the basics of getting around."
      />

      <SettingsSection title="Getting started" className="mt-2 lg:mt-6">
        <SettingsGroup>
          <ul className="divide-y divide-border/60">
            {HELP_TOPICS.map(({ Icon, title, body }) => (
              <li
                key={title}
                className="flex gap-3 px-1 py-3.5 first:pt-2 last:pb-2"
              >
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-muted/70 text-foreground/80">
                  <Icon className="h-4 w-4" strokeWidth={1.7} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium tracking-[-0.01em]">
                    {title}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Tips" className="mt-6">
        <SettingsGroup>
          <ul className="space-y-2.5 px-1 py-2 text-[13px] leading-relaxed text-muted-foreground">
            <li>
              The active menu tab shows its name; the others stay as icons so
              you can switch quickly.
            </li>
            <li>
              Create and manage spaces from General when you need a new one —
              the Spaces tab is for switching.
            </li>
            <li>
              Notification delivery preferences (push, email alerts) stay under
              General → Notifications.
            </li>
          </ul>
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  );
}
