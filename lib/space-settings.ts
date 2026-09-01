import type { SpaceId } from "./types";

export type SpaceSettingsItem = {
  id: string;
  name: string;
  detail: string;
  preview?: "theme" | "component" | "template" | "palette";
  themeClass?: "media-a" | "media-b" | "media-c" | "media-d";
  colors?: string[];
  image?: string;
  active?: boolean;
  tags?: string[];
};

export type SpaceSettingsSection = {
  id: string;
  label: string;
  description: string;
  items: SpaceSettingsItem[];
};

export type SpaceSettingsConfig = {
  title: string;
  subtitle: string;
  sections: SpaceSettingsSection[];
};

export const spaceSettings: Record<SpaceId, SpaceSettingsConfig> = {
  home: {
    title: "Home",
    subtitle: "Your starting point — in progress work and where to go next.",
    sections: [],
  },
  work: {
    title: "Work",
    subtitle: "Inbox, calendar, and customers — the day-to-day, not another app.",
    sections: [
      {
        id: "areas",
        label: "Areas",
        description: "What Work can keep in view.",
        items: [
          {
            id: "inbox",
            name: "Inbox",
            detail: "Mail, Slack, and anything waiting on a reply.",
            preview: "theme",
            themeClass: "media-a",
            colors: ["#14B8A6", "#CCFBF1"],
            active: true,
          },
          {
            id: "calendar",
            name: "Calendar",
            detail: "Meetings to prep and follow-ups after.",
            preview: "theme",
            themeClass: "media-c",
            colors: ["#38BDF8", "#E0F2FE"],
            active: true,
          },
          {
            id: "customers",
            name: "Customers",
            detail: "Accounts that need a note, proposal, or nudge.",
            preview: "theme",
            themeClass: "media-b",
            colors: ["#F59E0B", "#0F172A"],
            active: true,
          },
        ],
      },
      {
        id: "connectors",
        label: "Connectors",
        description:
          "Attach mail, calendar, chat, and CRM so Work can surface what needs you.",
        items: [],
      },
    ],
  },
  build: {
    title: "Build library",
    subtitle: "Templates, themes, and components — like a built-in 21st.dev kit for new apps.",
    sections: [
      {
        id: "templates",
        label: "Templates",
        description: "Full app shells we can scaffold into a live preview.",
        items: [
          {
            id: "saas",
            name: "SaaS landing",
            detail: "Hero, pricing, signup, and footer wired for preview.",
            preview: "template",
            image: "/previews/launch.png",
            tags: ["Marketing"],
          },
          {
            id: "portal",
            name: "Client portal",
            detail: "Auth, files, status updates, and account settings.",
            preview: "template",
            image: "/previews/portal.png",
            tags: ["Product"],
          },
          {
            id: "console",
            name: "Internal console",
            detail: "Tables, filters, detail panels, and bulk actions.",
            preview: "template",
            image: "/previews/console.png",
            tags: ["Ops"],
          },
          {
            id: "docs",
            name: "Docs site",
            detail: "Sidebar nav, search, and versioned content pages.",
            preview: "template",
            image: "/previews/docs.png",
            tags: ["Content"],
          },
        ],
      },
      {
        id: "themes",
        label: "Themes",
        description: "Default look for previews and shipped surfaces.",
        items: [
          {
            id: "graphite",
            name: "Graphite",
            detail: "Default — light canvas, dark chrome, blue mesh.",
            preview: "theme",
            themeClass: "media-a",
            colors: ["#6B9FFF", "#1E293B", "#F8FAFC"],
            active: true,
          },
          {
            id: "paper",
            name: "Paper",
            detail: "High-contrast white surfaces with minimal chrome.",
            preview: "theme",
            themeClass: "media-c",
            colors: ["#FFFFFF", "#E2E8F0", "#0F172A"],
          },
          {
            id: "midnight",
            name: "Midnight",
            detail: "Dark-first dashboards and dense product UI.",
            preview: "theme",
            themeClass: "media-b",
            colors: ["#6366F1", "#0B1220", "#94A3B8"],
          },
          {
            id: "aurora",
            name: "Aurora",
            detail: "Violet and cyan gradients for launch pages.",
            preview: "theme",
            themeClass: "media-d",
            colors: ["#22D3EE", "#A78BFA", "#F472B6"],
          },
        ],
      },
      {
        id: "components",
        label: "Components",
        description: "Reusable blocks dropped into the next build.",
        items: [
          {
            id: "auth",
            name: "Auth shell",
            detail: "Sign in, magic link, and workspace picker.",
            preview: "component",
            colors: ["#6B9FFF", "#E2E8F0"],
            tags: ["Forms"],
          },
          {
            id: "pricing",
            name: "Pricing table",
            detail: "Tier cards, feature matrix, and CTA row.",
            preview: "component",
            colors: ["#22C55E", "#E2E8F0"],
            tags: ["Marketing"],
          },
          {
            id: "nav",
            name: "App nav",
            detail: "Sidebar, top rail, and mobile drawer.",
            preview: "component",
            colors: ["#6366F1", "#CBD5E1"],
            tags: ["Layout"],
          },
          {
            id: "table",
            name: "Data table",
            detail: "Sortable rows, filters, and empty states.",
            preview: "component",
            colors: ["#F59E0B", "#E2E8F0"],
            tags: ["Data"],
          },
        ],
      },
      {
        id: "stack",
        label: "Stack",
        description: "Runtime used when scaffolding.",
        items: [
          {
            id: "next",
            name: "Next.js",
            detail: "App router, server actions, preview deploys.",
            preview: "palette",
            colors: ["#000000", "#FFFFFF"],
            active: true,
          },
          {
            id: "vite",
            name: "Vite + React",
            detail: "Fast SPA builds with client routing.",
            preview: "palette",
            colors: ["#646CFF", "#FFC107"],
          },
          {
            id: "static",
            name: "Static export",
            detail: "Marketing sites and lightweight landings.",
            preview: "palette",
            colors: ["#38BDF8", "#F1F5F9"],
          },
        ],
      },
    ],
  },
  research: {
    title: "Research library",
    subtitle: "Briefs, layouts, and citation styles for research papers.",
    sections: [
      {
        id: "briefs",
        label: "Briefs",
        description: "Structured starting points for new research.",
        items: [
          {
            id: "competitive",
            name: "Competitive scan",
            detail: "Pricing, positioning, and launch cadence.",
            preview: "component",
            colors: ["#FB923C", "#FFEDD5"],
            active: true,
          },
          {
            id: "market",
            name: "Market sizing",
            detail: "TAM, segments, and growth assumptions.",
            preview: "component",
            colors: ["#38BDF8", "#E0F2FE"],
          },
          {
            id: "voc",
            name: "Voice of customer",
            detail: "Themes from support, sales, and reviews.",
            preview: "component",
            colors: ["#A78BFA", "#EDE9FE"],
          },
        ],
      },
      {
        id: "layouts",
        label: "Paper layouts",
        description: "How sources and notes appear on the page.",
        items: [
          {
            id: "memo",
            name: "Executive memo",
            detail: "Short summary up top, evidence below.",
            preview: "theme",
            themeClass: "media-c",
            colors: ["#FFFFFF", "#0F172A", "#E2E8F0"],
            active: true,
          },
          {
            id: "dossier",
            name: "Source dossier",
            detail: "Long-form with inline citations.",
            preview: "theme",
            themeClass: "media-a",
            colors: ["#FFF7ED", "#EA580C", "#FED7AA"],
          },
        ],
      },
      {
        id: "sources",
        label: "Source types",
        description: "What gets pulled in by default.",
        items: [
          {
            id: "web",
            name: "Web pages",
            detail: "Articles, docs, changelogs, and blogs.",
            preview: "palette",
            colors: ["#3B82F6", "#DBEAFE"],
          },
          {
            id: "pdf",
            name: "PDFs & decks",
            detail: "Reports, investor updates, and slide exports.",
            preview: "palette",
            colors: ["#EF4444", "#FEE2E2"],
          },
        ],
      },
      {
        id: "citations",
        label: "Citations",
        description: "Formatting for references and footnotes.",
        items: [
          {
            id: "inline",
            name: "Inline links",
            detail: "Linked excerpts with hover previews.",
            preview: "component",
            colors: ["#0EA5E9", "#E0F2FE"],
            active: true,
          },
          {
            id: "footnotes",
            name: "Footnotes",
            detail: "Numbered references at the bottom.",
            preview: "component",
            colors: ["#64748B", "#F1F5F9"],
          },
        ],
      },
    ],
  },
  studio: {
    title: "Studio",
    subtitle: "Images, video, audio, and presentations — coming soon.",
    sections: [],
  },
};
