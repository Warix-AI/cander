import {
  Briefcase,
  Clock,
  Cpu,
  Globe,
  Hammer,
  ImageIcon,
  KeyRound,
  Mail,
  Mic,
  Presentation,
  Search,
  Sparkles,
  Telescope,
  UserRound,
  Users,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import type { DiscoveryItem } from "@/lib/discovery-types";
import { cn } from "@/lib/utils";

const lucideMap: Record<string, LucideIcon> = {
  calendar: CalendarDays,
  mail: Mail,
  clock: Clock,
  hammer: Hammer,
  image: ImageIcon,
  telescope: Telescope,
  globe: Globe,
  mic: Mic,
  briefcase: Briefcase,
  user: UserRound,
  users: Users,
  cpu: Cpu,
  key: KeyRound,
  presentation: Presentation,
  search: Search,
  sparkles: Sparkles,
};

export function DiscoveryIcon({
  item,
  size = "md",
  className,
}: {
  item: DiscoveryItem;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box =
    size === "lg"
      ? "h-11 w-11"
      : size === "sm"
        ? "h-7 w-7"
        : "h-8 w-8";
  const glyph = size === "lg" ? "h-5 w-5" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  if (item.iconKind === "connector") {
    return (
      <span className={cn("inline-flex shrink-0 items-center justify-center", box, className)}>
        <ConnectorMark id={item.icon} size={size === "lg" ? "md" : size === "sm" ? "xs" : "sm"} />
      </span>
    );
  }

  const Icon = lucideMap[item.icon] ?? Sparkles;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[10px] bg-muted text-foreground",
        box,
        className,
      )}
    >
      <Icon className={glyph} strokeWidth={1.6} />
    </span>
  );
}
