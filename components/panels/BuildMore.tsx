"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  BarChart3,
  Database,
  Plug,
  Search,
  Server,
  Shield,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { AreaChart } from "@/components/platform/Charts";
import { modelPreviews } from "@/components/platform/PlatformPreview";
import { useApp } from "@/components/app/AppProvider";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import {
  getBuildRuntimeServerSnapshot,
  getBuildRuntimeSnapshot,
  setBuildModel,
  subscribeBuildRuntime,
} from "@/lib/build-runtime";
import { connectors } from "@/lib/data";
import { hostingLabel } from "@/lib/billing";
import { runtimeLabel } from "@/lib/plan-entitlements";
import { sharedResourcesFor } from "@/lib/entitlements";
import {
  developmentDeepView,
  developmentIntegrated,
  developmentView,
} from "@/lib/product-copy";
import { cn } from "@/lib/utils";

type MoreSection =
  | "development"
  | "analytics"
  | "database"
  | "ai"
  | "agents"
  | "connectors"
  | "security"
  | "seo";

const NAV: {
  id: MoreSection;
  label: string;
  icon: typeof BarChart3;
}[] = [
  { id: "development", label: "Development", icon: Server },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "database", label: "Database", icon: Database },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "agents", label: "Agent integrations", icon: Waypoints },
  { id: "connectors", label: "Connectors", icon: Plug },
  { id: "security", label: "Security", icon: Shield },
  { id: "seo", label: "SEO & AI search", icon: Search },
];

const visitorSeries = [1, 2, 1, 3, 9, 2, 2];
const viewSeries = [2, 3, 2, 4, 11, 3, 3];

const metrics = [
  { id: "visitors", label: "Visitors", value: "13" },
  { id: "views", label: "Page views", value: "18" },
  { id: "per", label: "Views per visit", value: "1.38" },
  { id: "duration", label: "Visit duration", value: "1m 30s" },
  { id: "bounce", label: "Bounce rate", value: "93%" },
] as const;

export function BuildMore() {
  const [section, setSection] = useState<MoreSection>("development");

  return (
    <div className="flex h-full min-h-0">
      <nav
        className="w-[13.5rem] shrink-0 overflow-y-auto border-r border-border bg-sidebar px-2 py-3"
        aria-label="Project"
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] tracking-[-0.01em] transition-colors duration-200",
                active
                  ? "bg-sidebar-accent font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background px-8 py-8">
        {section === "development" ? <DevelopmentPane /> : null}
        {section === "analytics" ? <AnalyticsPane /> : null}
        {section === "database" ? <DatabasePane /> : null}
        {section === "ai" ? <AiPane /> : null}
        {section === "agents" ? <AgentsPane /> : null}
        {section === "connectors" ? <ConnectorsPane /> : null}
        {section === "security" ? <SecurityPane /> : null}
        {section === "seo" ? <SeoPane /> : null}
      </div>
    </div>
  );
}

function DevelopmentPane() {
  const selectedModel = useSyncExternalStore(
    subscribeBuildRuntime,
    getBuildRuntimeSnapshot,
    getBuildRuntimeServerSnapshot,
  );
  const { hostingMode, setProduct, entitlements, workspaceId, actor } = useApp();
  const shared = sharedResourcesFor(workspaceId, actor, entitlements);
  const usingShared = shared.find((item) => item.kind === "model");

  return (
    <Section title="Development" body={developmentIntegrated}>
      <Fact label="Hosting" value={hostingLabel(hostingMode)} />
      <Fact label="Model" value={selectedModel} />
      {usingShared ? (
        <Fact
          label="Shared runtime"
          value={`Using ${usingShared.name} (shared)`}
        />
      ) : null}
      <Fact label="API routes" value="Provisioned" />
      <Fact label="Keys" value="Managed by Courier" />
      <Fact
        label="Runtime"
        value={runtimeLabel(entitlements.plan)}
      />
      <div className="border-t border-border px-4 py-4">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {developmentDeepView}
        </p>
        <button
          type="button"
          onClick={() => setProduct("platform")}
          className="mt-4 inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:bg-foreground"
        >
          Open {developmentView.label} view
        </button>
      </div>
    </Section>
  );
}

function AnalyticsPane() {
  const [metric, setMetric] = useState<(typeof metrics)[number]["id"]>(
    "visitors",
  );
  const series = metric === "views" ? viewSeries : visitorSeries;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[1.65rem] font-semibold tracking-[-0.04em]">
          Analytics
        </h2>
        <div className="flex items-center gap-3">
          <p className="inline-flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-2 opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-chart-2" />
            </span>
            0 current visitors
          </p>
          <span className="rounded-[10px] border border-border bg-card px-3 py-1.5 text-[12.5px]">
            Last 7 days
          </span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-border bg-border sm:grid-cols-5">
        {metrics.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMetric(item.id)}
            className={cn(
              "bg-card px-4 py-3 text-left",
              metric === item.id && "ring-1 ring-inset ring-foreground/20",
            )}
          >
            <p className="text-[12px] text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-[1.35rem] font-medium tracking-[-0.03em]">
              {item.value}
            </p>
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-[10px] border border-border bg-card p-5">
        <AreaChart values={series} />
        <div className="mt-2 flex justify-between font-mono text-[11px] text-muted-foreground">
          <span>Aug 10</span>
          <span>Aug 13</span>
          <span>Aug 16</span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Breakdown
          title="Source"
          rows={[
            { label: "Direct", value: "14", pct: 93 },
            { label: "chatgpt.com", value: "1", pct: 7 },
          ]}
        />
        <Breakdown
          title="Page"
          rows={[
            { label: "/", value: "13", pct: 93 },
            { label: "/oauth/callback", value: "1", pct: 7 },
          ]}
          accent="chart-3"
        />
        <Breakdown
          title="Device"
          rows={[
            { label: "Desktop", value: "64.3%", pct: 64 },
            { label: "Mobile", value: "35.7%", pct: 36 },
          ]}
        />
        <Breakdown
          title="Country"
          rows={[{ label: "United States", value: "8", pct: 100 }]}
          accent="chart-3"
        />
      </div>
    </div>
  );
}

function Breakdown({
  title,
  rows,
  accent = "chart-2",
}: {
  title: string;
  rows: { label: string; value: string; pct: number }[];
  accent?: "chart-2" | "chart-3";
}) {
  return (
    <div className="rounded-[10px] border border-border bg-card p-5">
      <p className="text-[14px] font-medium">{title}</p>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate">{row.label}</span>
              <span className="font-mono text-[12px] text-muted-foreground">
                {row.value}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  accent === "chart-3" ? "bg-chart-3" : "bg-chart-2",
                )}
                style={{ width: `${Math.max(row.pct, 6)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DatabasePane() {
  return (
    <Section
      title="Database"
      body="Tables this app is using. Schema stays with the project, not in chat."
    >
      <Fact label="leads" value="12,481 rows" />
      <Fact label="plans" value="3 rows" />
      <Fact label="sessions" value="84k rows" />
    </Section>
  );
}

function AiPane() {
  const selectedModel = useSyncExternalStore(
    subscribeBuildRuntime,
    getBuildRuntimeSnapshot,
    getBuildRuntimeServerSnapshot,
  );
  const { spaceLayout, entitlements } = useApp();
  const canChoose = entitlements.hasModelChoice;
  const items = modelPreviews().map((item) => {
    const name = item.projectId.includes(":")
      ? item.projectId.slice(item.projectId.indexOf(":") + 1)
      : item.name;
    return {
      ...item,
      badge: selectedModel === name ? "Selected" : item.badge,
    };
  });

  return (
    <Section
      title="AI"
      body={
        canChoose
          ? "Models and APIs are already wired in. Pick what this app uses when it runs."
          : "This plan runs on one shared model. Max can choose from the catalog."
      }
    >
      <Fact label="Default model" value={selectedModel} />
      <Fact label="Requests · 7d" value="1.24k" />
      <Fact label="Cache hit rate" value="34%" />
      {canChoose ? (
      <div className="border-t border-border px-4 py-4">
        <p className="mb-3 text-[13px] text-muted-foreground">
          Click a model to use it for this build.
        </p>
        <PreviewGrid
          layout={spaceLayout}
          items={items}
          onOpen={(id) => {
            const name = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
            setBuildModel(name);
          }}
          empty="No models."
        />
      </div>
      ) : null}
    </Section>
  );
}

function AgentsPane() {
  return (
    <Section
      title="Agent integrations"
      body="Actions this app can take on behalf of a visitor."
    >
      <Fact label="Chat" value="Enabled" />
      <Fact label="Publish" value="Courier" />
      <Fact label="Scheduled jobs" value="2 attached" />
    </Section>
  );
}

function ConnectorsPane() {
  const list = connectors.slice(0, 4);
  return (
    <Section
      title="Connectors"
      body="Accounts this project can call. Manage the rest from Connectors."
    >
      {list.map((item) => (
        <Fact
          key={item.id}
          label={item.name}
          value={item.installed ? "Installed" : "Available"}
        />
      ))}
    </Section>
  );
}

function SecurityPane() {
  return (
    <Section
      title="Security"
      body="Auth, secrets, and who can publish this app."
    >
      <Fact label="Auth" value="Magic link" />
      <Fact label="Secrets" value="2 saved" />
      <Fact label="Publish access" value="Workspace members" />
    </Section>
  );
}

function SeoPane() {
  const { project } = useApp();
  return (
    <Section
      title="SEO & AI search"
      body="How this site shows up in search and in answers."
    >
      <Fact label="Index" value="Ready" />
      <Fact label="Title" value={project?.name ?? "Untitled app"} />
      <Fact label="Sitemap" value="/sitemap.xml" />
    </Section>
  );
}

function Section({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h2 className="text-[1.65rem] font-semibold tracking-[-0.04em]">
        {title}
      </h2>
      <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      <div className="mt-6 overflow-hidden rounded-[10px] border border-border">
        {children}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span className="text-[13.5px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[12px]">{value}</span>
    </div>
  );
}
