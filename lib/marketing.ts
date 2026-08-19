import type { Metadata } from "next";

export const SITE_URL = "https://getcourier.ai";
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
    title: "One AI for Everything",
    description:
      "One AI product to chat, work, build, research, create, and run production AI — in the cloud, locally, or on your device.",
  },
  "/pricing": {
    path: "/pricing",
    title: "Pricing — Free, Pro, Max & Ultra",
    description:
      "Free to start. Pro $20, Max $50, Ultra $300 per user per month. Cloud on every plan. Development starts on Pro.",
  },
  "/spaces": {
    path: "/spaces",
    title: "Spaces — Work, Build, Studio, Research & Personal",
    description:
      "Your work has different shapes. Enter Work, Build, Studio, Research, or Personal — or let Courier hand work into them from chat.",
  },
  "/work": {
    path: "/work",
    title: "Work — Inbox, Calendar & Customers",
    description:
      "Work is Courier for day-to-day operations — inbox, calendar, and customers. Available on Max and Ultra.",
  },
  "/build": {
    path: "/build",
    title: "Build — Apps, Websites & Agents with AI",
    description:
      "Software, sites, and agents with live preview, files, and Development wired in. No build pipeline to manage. Available on every plan.",
  },
  "/studio": {
    path: "/studio",
    title: "Studio — Images & Video",
    description:
      "Create images and video without leaving Courier. Generate, canvas, library, and export — on every plan.",
  },
  "/research": {
    path: "/research",
    title: "Research — Sources, Browser & Reports",
    description:
      "Research that becomes usable work — browser, sources, notes, and reports inside Courier. Available on every plan.",
  },
  "/personal": {
    path: "/personal",
    title: "Personal — Today, Money, Health & Goals",
    description:
      "Today, money, health, goals, and the car — separate from product work. Available on every plan. Organizations can hide Personal.",
  },
  "/development": {
    path: "/development",
    title: "Development — Build and Run AI",
    description:
      "Hosting, APIs, models, and deployments inside Courier. Pro to build, Max to collaborate, Ultra to operate production AI.",
  },
  "/hosting": {
    path: "/hosting",
    title: "Hosting — Cloud, Local & On-device AI",
    description:
      "Run Courier where you want. Cloud, Local, and On-device are compute locations — not plans. Production serving is Ultra.",
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
      "Courier works with what you already use. Featured connectors, categorized catalog, and policies on Max and Ultra.",
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
      "How Courier isolates work: Cloud, Local, and On-device locations, workspace roles, connector policies, and audit.",
  },
  "/docs": {
    path: "/docs",
    title: "Docs — Live in Development",
    description:
      "Product docs live in Courier Development. Open Courier to read APIs, keys, models, and hosting in context.",
  },
};

export function marketingMetadata(path: keyof typeof marketingPages): Metadata {
  const page = marketingPages[path];
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: page.path },
    openGraph: {
      title: `${page.title} | Courier`,
      description: page.description,
      url: page.path,
      siteName: "Courier",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${page.title} | Courier`,
      description: page.description,
    },
  };
}

export const spacesNav = [
  { href: "/spaces", title: "Overview", body: "Five spaces, one product." },
  { href: "/build", title: "Build", body: "Software, sites, and agents." },
  { href: "/studio", title: "Studio", body: "Images and video." },
  { href: "/research", title: "Research", body: "Browser, sources, reports." },
  { href: "/work", title: "Work", body: "Inbox, calendar, customers." },
  { href: "/personal", title: "Personal", body: "Today, money, health, goals." },
] as const;

/** @deprecated use spacesNav */
export const productNav = spacesNav;

export const developmentNav = [
  { href: "/development", title: "Overview", body: "Build through production." },
  { href: "/hosting", title: "Hosting", body: "Cloud, Local, On-device." },
  { href: "/models", title: "Models", body: "Catalog and runtimes." },
] as const;

export const headerLinks = [
  { href: "/hosting", title: "Hosting" },
  { href: "/pricing", title: "Pricing" },
  { href: "/enterprise", title: "Enterprise" },
] as const;

export const footerGroups: {
  label: string;
  links: { href: string; title: string; external?: boolean }[];
}[] = [
  {
    label: "Courier",
    links: [
      { href: "/home", title: "Home" },
      { href: "/spaces", title: "Spaces" },
      { href: "/build", title: "Build" },
      { href: "/studio", title: "Studio" },
      { href: "/research", title: "Research" },
      { href: "/development", title: "Development" },
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
    href: "/build",
    title: "Build",
    kicker: "Every plan",
    blurb: "Software, sites, and agents.",
    media: "media-b",
  },
  {
    id: "studio",
    href: "/studio",
    title: "Studio",
    kicker: "Every plan",
    blurb: "Create images and video without leaving Courier.",
    media: "media-c",
  },
  {
    id: "research",
    href: "/research",
    title: "Research",
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
