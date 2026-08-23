"use client";

import { useState, type ReactNode } from "react";
import {
  Activity,
  BookOpen,
  Gauge,
  Radio,
} from "lucide-react";
import {
  AreaChart,
  BarPair,
  FunnelChart,
} from "@/components/platform/Charts";
import { useApp } from "@/components/app/AppProvider";
import {
  billingFor,
  hostingModes,
  money,
  orgSeatMix,
  planLabel,
} from "@/lib/billing";
import {
  apiKeys,
  platformApis,
  platformDeployments,
  platformDocs,
  workspaces,
} from "@/lib/data";
import { nextPlanTier } from "@/lib/plan-entitlements";
import { PlatformAskButton } from "@/components/platform/PlatformChatDock";
import {
  DataList,
  DataRow,
  EmptyHint,
  GhostBtn,
  ItemCard,
  MeterCard,
  PanelToolbar,
  Section,
  SoftNote,
  StatCard,
  StatusPill,
} from "@/components/platform/DevChrome";
import { HostingPanel } from "@/components/platform/HostingPanel";
import { ModelsPanel } from "@/components/platform/ModelsPanel";
import { DashFrame, ScopeToggle } from "@/components/spaces/ItemSet";
import { developmentView } from "@/lib/product-copy";
import { cn } from "@/lib/utils";

const requestSeries = [42, 48, 45, 61, 70, 68, 82, 90, 86, 98, 112, 108];

const LOG_ROWS = [
  {
    time: "14:11",
    route: "chat.completions",
    status: 200,
    latency: "340ms",
    model: "gemma-4-e4b",
    where: "on-device",
  },
  {
    time: "14:09",
    route: "embeddings",
    status: 200,
    latency: "22ms",
    model: "embedding-3",
    where: "cloud",
  },
  {
    time: "14:02",
    route: "chat.completions",
    status: 200,
    latency: "180ms",
    model: "local-lan",
    where: "local",
  },
  {
    time: "13:58",
    route: "images.generations",
    status: 429,
    latency: "12ms",
    model: "cloud",
    where: "cloud",
  },
  {
    time: "13:51",
    route: "tools",
    status: 200,
    latency: "96ms",
    model: "mistral-small",
    where: "cloud",
  },
];

export function PlatformMain() {
  const {
    platformNav,
    hostingMode,
    billingPlan,
    entitlements,
    orgMembers,
  } = useApp();
  const bill = billingFor(hostingMode, {
    seatMix: orgSeatMix(orgMembers),
    plan: billingPlan,
  });

  if (platformNav === "overview") {
    const hostingLabel =
      hostingModes.find((item) => item.id === hostingMode)?.label ?? hostingMode;

    return (
      <Page
        title="Overview"
        kicker={developmentView.kicker}
        subtitle="Traffic, runtimes, and production capacity for this workspace."
      >
        <div className="space-y-6">
          <Section title="Snapshot">
            <div className="grid grid-cols-1 gap-3 @min-[360px]:grid-cols-2 @min-[720px]:grid-cols-4">
              <StatCard
                icon={Activity}
                label="Requests"
                value="1.24M"
                hint="+12% vs last month"
              />
              <StatCard
                icon={Gauge}
                label="Completion rate"
                value="81%"
                hint="+3.1 pts"
              />
              <StatCard icon={Radio} label="Uptime" value="99.97%" />
              <StatCard
                icon={BookOpen}
                label="Development"
                value={entitlements.devDepthLabel}
              />
            </div>
          </Section>

          <Section title="Traffic" hint="Last 12 weeks">
            <div className="rounded-[10px] border border-border bg-card p-4 sm:p-5">
              <AreaChart values={requestSeries} />
            </div>
          </Section>

          <div className="grid grid-cols-1 gap-6 @min-[640px]:grid-cols-2">
            <Section title="Funnel" hint="This month">
              <div className="rounded-[10px] border border-border bg-card p-4 sm:p-5">
                <FunnelChart
                  stages={[
                    { label: "Requests", value: "1.24M", pct: 100 },
                    { label: "Completions", value: "1.01M", pct: 81 },
                    { label: "Cache hits", value: "420k", pct: 34 },
                    { label: "Routed locally", value: "88k", pct: 7 },
                  ]}
                />
              </div>
            </Section>

            <Section title="Where it ran">
              <div className="rounded-[10px] border border-border bg-card p-4 sm:p-5">
                <BarPair
                  left={{ label: "Cloud", pct: 64 }}
                  right={{ label: "Local + on-device", pct: 36 }}
                />
                <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
                  Active hosting is {hostingLabel}. Seats bill in Settings →
                  Plans; hosting only chooses where inference runs.
                </p>
              </div>
            </Section>
          </div>

          <Section title="Runtime mix">
            <div className="space-y-3">
              {[
                { name: "On-device Gemma 4", pct: 38 },
                { name: "Cloud large", pct: 41 },
                { name: "Local LAN", pct: 21 },
              ].map((row) => (
                <MeterCard
                  key={row.name}
                  label={row.name}
                  valueLabel={`${row.pct}%`}
                  pct={row.pct}
                />
              ))}
            </div>
          </Section>
        </div>
      </Page>
    );
  }

  if (platformNav === "hosting") return <HostingPage />;

  if (platformNav === "models") {
    return (
      <Page
        title="Models"
        kicker="Runtime"
        subtitle="Cloud, local, and on-device models this workspace can run."
      >
        <ModelsPanel />
      </Page>
    );
  }

  if (platformNav === "api") return <ApisPage />;

  if (platformNav === "keys") return <KeysPage />;

  if (platformNav === "deployments") return <DeploymentsPage />;

  if (platformNav === "logs") {
    return (
      <Page
        title="Logs"
        kicker="Infrastructure"
        subtitle="Recent platform traffic and errors."
      >
        <Section
          title="Recent requests"
          description="Newest first · live demo sample."
        >
          <DataList>
            {LOG_ROWS.map((row) => (
              <div
                key={`${row.time}-${row.route}-${row.model}`}
                className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-medium tracking-[-0.01em]">
                      {row.route}
                    </p>
                    <StatusPill
                      tone={row.status >= 400 ? "danger" : "muted"}
                    >
                      {row.status}
                    </StatusPill>
                  </div>
                  <p className="mt-1 font-mono text-[11.5px] text-muted-foreground">
                    {row.model} · {row.where}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 font-mono text-[12px] text-muted-foreground">
                  <span>{row.latency}</span>
                  <span>{row.time}</span>
                </div>
              </div>
            ))}
          </DataList>
        </Section>
      </Page>
    );
  }

  if (platformNav === "usage") {
    const splitAccounts = entitlements.canManageWorkspaces;
    const split = [
      { id: "marketing", pct: 38, requests: "472k" },
      { id: "engineering", pct: 44, requests: "546k" },
      { id: "operations", pct: 18, requests: "223k" },
    ].map((row) => ({
      ...row,
      name: workspaces.find((item) => item.id === row.id)?.name ?? row.id,
    }));

    return (
      <Page
        title="Usage"
        kicker="Analytics"
        subtitle={
          splitAccounts
            ? "Split by account — each workspace has its own request mix."
            : "Pooled for this account. Split by workspace starts on Max."
        }
      >
        <div className="space-y-6">
          <Section title="Requests" hint="Last 12 weeks">
            <div className="rounded-[10px] border border-border bg-card p-4 sm:p-5">
              <AreaChart values={requestSeries} />
            </div>
          </Section>

          <Section
            title={splitAccounts ? "By account" : "This account"}
            description={
              splitAccounts
                ? "Share of requests across workspaces."
                : "Usage is pooled on Pro. Max splits requests by workspace."
            }
          >
            {splitAccounts ? (
              <div className="space-y-3">
                {split.map((row) => (
                  <MeterCard
                    key={row.id}
                    label={row.name}
                    valueLabel={`${row.requests} · ${row.pct}%`}
                    pct={row.pct}
                  />
                ))}
              </div>
            ) : (
              <SoftNote>1.24M requests · 12 weeks · pooled</SoftNote>
            )}
          </Section>

          <Section title="Capacity">
            <DataList>
              {splitAccounts
                ? split.map((row) => (
                    <DataRow
                      key={row.id}
                      label={row.name}
                      value={`${row.requests} · ${row.pct}%`}
                    />
                  ))
                : null}
              <DataRow label="Cloud requests" value="1.2M · metered" />
              <DataRow
                label="Local + on-device"
                value="Unlimited on your hardware"
              />
              <DataRow label="Plan" value={planLabel(bill.plan)} />
              <DataRow
                label="Seats"
                value={`${bill.users} · ${money(bill.courier)}/month`}
              />
            </DataList>
          </Section>
        </div>
      </Page>
    );
  }

  if (platformNav === "recents") return null;

  return (
    <Page
      title="Docs & SDK"
      kicker="Developers"
      subtitle="Guides and SDKs for development in Courier."
    >
      <Section
        title="Guides"
        description="SDKs and platform docs for this workspace."
      >
        <div className="grid grid-cols-1 gap-3 @min-[440px]:grid-cols-2 @min-[720px]:grid-cols-3">
          {platformDocs.map((item) => (
            <ItemCard
              key={item.title}
              title={item.title}
              meta={item.kind}
              badge={<StatusPill tone="outline">{item.kind}</StatusPill>}
              body={
                <p
                  className={cn(
                    "text-[12.5px] leading-relaxed text-muted-foreground",
                    item.kind === "SDK" && "break-all font-mono text-[12px]",
                  )}
                >
                  {item.body}
                </p>
              }
            />
          ))}
        </div>
      </Section>
    </Page>
  );
}

function ApisPage() {
  const [extra, setExtra] = useState<typeof platformApis>([]);
  const [draft, setDraft] = useState<{ name: string; path: string } | null>(
    null,
  );
  const [scope, setScope] = useState("all");
  const apis = [...extra, ...platformApis];
  const visible =
    scope === "all"
      ? apis
      : apis.filter((api) => api.method.toLowerCase() === scope);

  const addApi = () => {
    const name = draft?.name.trim() || "Custom API";
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "custom";
    const path = draft?.path.trim() || `/v1/${slug}`;
    setExtra((current) => [
      {
        id: `api-${Math.random().toString(36).slice(2, 7)}`,
        name,
        path,
        method: "POST",
      },
      ...current,
    ]);
    setDraft(null);
  };

  return (
    <Page
      title="APIs"
      kicker="OpenAI-compatible"
      subtitle="Routes this workspace exposes for apps you build in Courier."
    >
      <PanelToolbar
        trailing={
          <>
            <GhostBtn onClick={() => setDraft({ name: "", path: "" })}>
              Add API
            </GhostBtn>
            <UpgradeTrailing />
          </>
        }
      >
        <ScopeToggle
          value={scope}
          onChange={setScope}
          options={[
            { id: "all", label: "All" },
            { id: "post", label: "POST" },
            { id: "get", label: "GET" },
          ]}
        />
      </PanelToolbar>

      {draft ? (
        <div className="mt-6 rounded-[10px] border border-border bg-card px-4 py-4 sm:px-5">
          <p className="text-[14px] font-medium tracking-[-0.02em]">New API</p>
          <input
            autoFocus
            value={draft.name}
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, name: event.target.value } : current,
              )
            }
            placeholder="Name"
            className="mt-3 w-full rounded-[10px] border border-foreground/10 bg-background px-3 py-2 text-[13.5px] outline-none"
          />
          <input
            value={draft.path}
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, path: event.target.value } : current,
              )
            }
            placeholder="/v1/custom"
            className="mt-2 w-full rounded-[10px] border border-foreground/10 bg-background px-3 py-2 font-mono text-[12px] outline-none"
          />
          <div className="mt-4 flex gap-2">
            <GhostBtn primary onClick={addApi}>
              Add API
            </GhostBtn>
            <GhostBtn onClick={() => setDraft(null)}>Cancel</GhostBtn>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <Section
          title="Routes"
          description="OpenAI-compatible paths served for this workspace."
        >
          {visible.length ? (
            <DataList>
              {visible.map((api) => (
                <DataRow
                  key={api.id}
                  label={
                    <span className="flex flex-wrap items-center gap-2">
                      {api.name}
                      <StatusPill tone="outline">{api.method}</StatusPill>
                    </span>
                  }
                  meta={
                    <span className="font-mono text-[11.5px]">
                      {api.path} · api.courier.dev
                    </span>
                  }
                />
              ))}
            </DataList>
          ) : (
            <EmptyHint>No APIs in this filter.</EmptyHint>
          )}
        </Section>
      </div>
    </Page>
  );
}

function KeysPage() {
  const [extra, setExtra] = useState<typeof apiKeys>([]);
  const keys = [...extra, ...apiKeys];

  return (
    <Page
      title="Keys"
      kicker="Developers"
      subtitle="Credentials for apps and CI. Keep them out of source."
    >
      <PanelToolbar
        trailing={
          <>
            <GhostBtn
              onClick={() => {
                const stamp = Math.random().toString(36).slice(2, 6);
                setExtra((current) => [
                  {
                    name: `Key ${current.length + 1}`,
                    hint: `crr_live_••••${stamp}`,
                    created: "Just now",
                  },
                  ...current,
                ]);
              }}
            >
              Add key
            </GhostBtn>
            <UpgradeTrailing />
          </>
        }
      />

      <div className="mt-6">
        <Section
          title="API keys"
          description="Click a row to copy the hint to your clipboard."
        >
          {keys.length ? (
            <DataList>
              {keys.map((key) => (
                <DataRow
                  key={`${key.name}-${key.hint}`}
                  label={key.name}
                  meta={
                    <span className="font-mono text-[11.5px]">{key.hint}</span>
                  }
                  value={`Created ${key.created}`}
                  onClick={() => {
                    void navigator.clipboard.writeText(key.hint);
                  }}
                />
              ))}
            </DataList>
          ) : (
            <EmptyHint>No keys yet.</EmptyHint>
          )}
        </Section>
      </div>
    </Page>
  );
}

function DeploymentsPage() {
  const [scope, setScope] = useState("all");
  const visible =
    scope === "all"
      ? platformDeployments
      : platformDeployments.filter(
          (item) => item.status.toLowerCase() === scope,
        );

  return (
    <Page
      title="Deployments"
      kicker="Hosting"
      subtitle="Where this workspace’s runtime is live."
    >
      <PanelToolbar trailing={<UpgradeTrailing />}>
        <ScopeToggle
          value={scope}
          onChange={setScope}
          options={[
            { id: "all", label: "All" },
            { id: "active", label: "Active" },
            { id: "standby", label: "Standby" },
            { id: "ready", label: "Ready" },
          ]}
        />
      </PanelToolbar>

      <div className="mt-6">
        <Section
          title="Runtimes"
          description="Cloud regions, LAN boxes, and on-device fleets."
        >
          {visible.length ? (
            <div className="grid grid-cols-1 gap-3 @min-[480px]:grid-cols-2">
              {visible.map((item) => (
                <ItemCard
                  key={item.name}
                  title={item.name}
                  meta={`${item.hosting} · ${item.hint}`}
                  selected={item.status === "Active"}
                  badge={
                    <StatusPill
                      tone={
                        item.status === "Active"
                          ? "active"
                          : item.status === "Standby"
                            ? "muted"
                            : "outline"
                      }
                    >
                      {item.status}
                    </StatusPill>
                  }
                  body={
                    <p className="text-[12.5px] text-muted-foreground">
                      {item.status === "Active"
                        ? "Serving production traffic for this workspace."
                        : item.status === "Standby"
                          ? "Warm failover — ready to promote."
                          : "Available capacity, not currently primary."}
                    </p>
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyHint>No deployments in this filter.</EmptyHint>
          )}
        </Section>
      </div>
    </Page>
  );
}

function UpgradeTrailing() {
  const { entitlements, openSettings } = useApp();
  const next = nextPlanTier(entitlements.plan);
  if (!next) return null;
  return (
    <GhostBtn onClick={() => openSettings("plans")}>View plans</GhostBtn>
  );
}

function HostingPage() {
  return (
    <Page
      title="Hosting"
      kicker="Capacity"
      subtitle="Cloud, Local, and On-device — same product, different runtimes. Not a plan."
    >
      <HostingPanel />
    </Page>
  );
}

function Page({
  title,
  kicker,
  subtitle,
  children,
}: {
  title: string;
  kicker: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { platformNav } = useApp();
  return (
    <DashFrame
      bannerKey={`plat-${platformNav}`}
      kicker={kicker}
      title={title}
      subtitle={subtitle}
      actions={<PlatformAskButton />}
    >
      {children}
    </DashFrame>
  );
}
