import {
  Blocks,
  CalendarClock,
  Clapperboard,
  Hammer,
  Search,
  Sparkles,
} from "lucide-react";
import type { SpaceId } from "./types";

export const spaceIcons: Record<SpaceId, typeof Hammer> = {
  build: Hammer,
  studio: Clapperboard,
  research: Search,
  skills: Sparkles,
  connectors: Blocks,
  scheduled: CalendarClock,
};

export const chatSpaceCopy: Record<
  "build" | "studio" | "research" | "skills",
  { heading: string; body: string }
> = {
  build: {
    heading: "What should we build?",
    body: "Sites, apps, and previews stay on the right. Chat stays the command layer.",
  },
  studio: {
    heading: "What are we making?",
    body: "Still, retouch, background remove, and text-to-video live on the canvas.",
  },
  research: {
    heading: "What should we look into?",
    body: "Sources, notes, and the live page stay attached to this chat.",
  },
  skills: {
    heading: "What should this skill do?",
    body: "Describe it in chat, or edit name, timing, and instructions on the right.",
  },
};
