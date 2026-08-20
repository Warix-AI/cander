"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Briefcase,
  Calendar,
  Car,
  CheckSquare,
  Cpu,
  FileText,
  Gauge,
  Hammer,
  ImageIcon,
  KeyRound,
  LayoutGrid,
  ListTodo,
  MessageSquare,
  Rocket,
  ScrollText,
  Search,
  Server,
  Sparkles,
  Target,
  Video,
  Wallet,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "brief-inbox": MessageSquare,
  "prep-meeting": Calendar,
  "chase-followups": ListTodo,
  approvals: CheckSquare,
  "personal-today": ListTodo,
  "personal-goals": Target,
  "personal-car": Car,
  "personal-week": Calendar,
  "build-app": Hammer,
  "build-site": LayoutGrid,
  "build-auto": Sparkles,
  "studio-image": ImageIcon,
  "studio-video": Video,
  "studio-edit": ImageIcon,
  "research-landscape": Search,
  "research-sources": BookOpen,
  "research-brief": FileText,
  "plat-overview": BarChart3,
  "plat-models": Cpu,
  "plat-keys": KeyRound,
  "ov-traffic": BarChart3,
  "ov-uptime": Activity,
  "ov-capacity": Gauge,
  "host-pick": Server,
  "host-cost": Wallet,
  "host-switch": Server,
  "model-pick": Cpu,
  "model-local": Cpu,
  "model-swap": Cpu,
  "api-endpoint": Waypoints,
  "api-errors": ScrollText,
  "api-rate": Gauge,
  "key-rotate": KeyRound,
  "key-scope": KeyRound,
  "key-audit": KeyRound,
  "dep-status": Rocket,
  "dep-rollback": Rocket,
  "dep-new": Rocket,
  "logs-errors": ScrollText,
  "logs-trace": Search,
  "logs-spike": Activity,
  "usage-month": BarChart3,
  "usage-cost": Wallet,
  "usage-forecast": Gauge,
  "docs-start": BookOpen,
  "docs-auth": KeyRound,
  "docs-local": Server,
};

export type SuggestionPromptItem = {
  id: string;
  label: string;
  prompt: string;
  /** Optional secondary bit after a middot, e.g. Connect. */
  hint?: string;
};

/** Vertical icon + short label list above the composer (ChatGPT-style). */
export function SuggestionPrompts({
  items,
  onSelect,
  className,
}: {
  items: SuggestionPromptItem[];
  onSelect: (prompt: string) => void;
  className?: string;
}) {
  if (!items.length) return null;

  return (
    <div
      className={cn(
        "mx-auto w-full min-w-0 max-w-[38rem] px-4 pb-1",
        className,
      )}
    >
      <div className="flex flex-col">
        {items.map((item) => {
          const Icon = ICONS[item.id] ?? Sparkles;
          return (
            <button
              key={item.id}
              type="button"
              title={item.prompt}
              onClick={() => onSelect(item.prompt)}
              className="flex min-w-0 items-center gap-3 rounded-[10px] px-1.5 py-2.5 text-left transition-colors duration-200 hover:bg-muted"
            >
              <Icon
                className="h-4 w-4 shrink-0 text-muted-foreground"
                strokeWidth={1.6}
                aria-hidden
              />
              <span className="min-w-0 truncate text-[13px] tracking-[-0.01em] text-foreground">
                {item.label}
                {item.hint ? (
                  <span className="text-muted-foreground"> · {item.hint}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
