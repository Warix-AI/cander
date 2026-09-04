import type { Metadata } from "next";
import { APP_NAME } from "@/lib/app-brand";

export const SITE_URL = "https://thinkrecursion.ai";
export const APP_HREF = "/";
export const ENTERPRISE_MAILTO =
  "mailto:enterprise@thinkrecursion.ai?subject=Enterprise%20request";
export const RECURSION_URL = "https://thinkrecursion.ai";

export type MarketingPage = {
  path: string;
  title: string;
  description: string;
};

export const marketingPages: Record<string, MarketingPage> = {
  "/home": {
    path: "/home",
    title: `${APP_NAME} for Everything`,
    description:
      "One AI product to chat, work, build, research, create, and run production AI — in the cloud, locally, or on your device.",
  },
  "/pricing": {
    path: "/pricing",
    title: "Pricing — Free, Pro & Max",
    description:
      "Free to start. Pro $20, Max $50 per month. Same Cander app on every plan — more power and collaboration as you upgrade.",
  },
  "/spaces": {
    path: "/spaces",
    title: "Spaces — Explore & Create",
    description:
      "Explore for research and discovery. Create for apps, sites, automations, and images — in one product.",
  },
  "/work": {
    path: "/work",
    title: "Work — Inbox, Calendar & Customers",
    description:
      "Work is for day-to-day operations — inbox, calendar, and customers. Available on every plan.",
  },
  "/create": {
    path: "/create",
    title: "Create — Apps, Sites, Automations & Images",
    description:
      "Make apps, websites, automations, and images in one Create space. Live preview and image playground — on every plan.",
  },
  "/build": {
    path: "/build",
    title: "Create — Apps, Sites, Automations & Images",
    description:
      "Make apps, websites, automations, and images in one Create space. Live preview and image playground — on every plan.",
  },
  "/studio": {
    path: "/studio",
    title: "Create — Apps, Sites, Automations & Images",
    description:
      "Make apps, websites, automations, and images in one Create space. Live preview and image playground — on every plan.",
  },
  "/research": {
    path: "/research",
    title: "Explore — Sources, Browser & Reports",
    description:
      "Explore research that becomes usable work — browser, sources, notes, and reports in the app. Available on every plan.",
  },
  "/personal": {
    path: "/personal",
    title: "Personal — Today, Money, Health & Goals",
    description:
      "Today, money, health, goals, and the car — separate from product work. Available on every plan. Organizations can hide Personal.",
  },
  "/hosting": {
    path: "/hosting",
    title: "Hosting — Cloud, Local & On-device AI",
    description:
      "Run it where you want. Cloud, Local, and On-device are compute locations — not plans. Production serving is Ultra.",
  },
  "/models": {
    path: "/models",
    title: "Models — Catalog, Runtime & Hardware",
    description:
      "Plan is permission. Hardware is capacity. Model is requirements. Pro has one shared model; Max the catalog; Ultra production.",
  },
  "/connectors": {
    path: "/connectors",
    title: "Connectors — Gmail, Slack, GitHub & More",
    description:
      "Works with what you already use. Featured connectors, categorized catalog, and policies on Max and Ultra.",
  },
  "/enterprise": {
    path: "/enterprise",
    title: "Enterprise — Custom Plans, SSO & Residency",
    description:
      "Custom plans, SSO, residency, SLAs, and mixed Cloud, Local, and On-device compute. Talk to Recursion AI.",
  },
  "/security": {
    path: "/security",
    title: "Security — Locations, Roles & Policies",
    description:
      "How we isolate work: Cloud, Local, and On-device locations, workspace roles, connector policies, and audit.",
  },
  "/docs": {
    path: "/docs",
    title: "Docs — Hosting, Models & APIs",
    description:
      "Product docs for hosting, models, and APIs. Open the app to read them next to the work.",
  },
};

export function marketingMetadata(path: keyof typeof marketingPages): Metadata {
  const page = marketingPages[path];
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: page.path },
    openGraph: {
      title: `${page.title} | ${APP_NAME}`,
      description: page.description,
      url: page.path,
      siteName: APP_NAME,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${page.title} | ${APP_NAME}`,
      description: page.description,
    },
  };
}

export const spacesNav = [
  { href: "/spaces", title: "Overview", body: "Explore and Create in one product." },
  { href: "/create", title: "Create", body: "Apps, sites, automations, and images." },
  { href: "/research", title: "Explore", body: "Browser, sources, reports." },
  { href: "/work", title: "Work", body: "Inbox, calendar, customers." },
  { href: "/personal", title: "Personal", body: "Today, money, health, goals." },
] as const;

/** @deprecated use spacesNav */
export const productNav = spacesNav;

export const headerLinks = [
  { href: "/hosting", title: "Hosting" },
  { href: "/models", title: "Models" },
  { href: "/pricing", title: "Pricing" },
  { href: "/enterprise", title: "Enterprise" },
] as const;

export const footerGroups: {
  label: string;
  links: { href: string; title: string; external?: boolean }[];
}[] = [
  {
    label: "Product",
    links: [
      { href: "/home", title: "Home" },
      { href: "/spaces", title: "Spaces" },
      { href: "/create", title: "Create" },
      { href: "/research", title: "Explore" },
      { href: "/hosting", title: "Hosting" },
      { href: "/models", title: "Models" },
      { href: "/connectors", title: "Connectors" },
      { href: "/pricing", title: "Pricing" },
    ],
  },
  {
    label: "Company",
    links: [
      { href: RECURSION_URL, title: "Recursion AI", external: true },
      { href: "/enterprise", title: "Enterprise" },
      { href: "/security", title: "Security" },
      { href: ENTERPRISE_MAILTO, title: "Contact", external: true },
    ],
  },
  {
    label: "Resources",
    links: [{ href: "/docs", title: "Docs" }],
  },
];

export const marketingSpaces = [
  {
    id: "work",
    href: "/work",
    title: "Work",
    kicker: "Max & Ultra",
    blurb: "Inbox, calendar, customers.",
    media: "media-a",
  },
  {
    id: "build",
    href: "/create",
    title: "Create",
    kicker: "Every plan",
    blurb: "Apps, sites, automations, and images.",
    media: "media-b",
  },
  {
    id: "studio",
    href: "/create",
    title: "Create",
    kicker: "Every plan",
    blurb: "Apps, sites, automations, and images.",
    media: "media-c",
  },
  {
    id: "research",
    href: "/research",
    title: "Explore",
    kicker: "Every plan",
    blurb: "Research that becomes usable work.",
    media: "media-d",
  },
  {
    id: "personal",
    href: "/personal",
    title: "Personal",
    kicker: "Every plan",
    blurb: "Today, money, health, goals, and the car.",
    media: "hero-gradient",
  },
] as const;
