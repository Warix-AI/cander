"use client";

import { useState, type ReactNode } from "react";
import {
  AreaChart,
  BarPair,
  ChartCard,
  FunnelChart,
  Kpi,
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
  platformDocs,
  workspaceResources,
  workspaces,
} from "@/lib/data";
import { memberName, sharedResourcesFor } from "@/lib/entitlements";
import { nextPlanTier } from "@/lib/plan-entitlements";
import { PlatformAskButton } from "@/components/platform/PlatformChatDock";
import {
  PlatformPreviewGrid,
  apiPreviews,
  deploymentFilters,
  deploymentPreviews,
  hostingPreviews,
  keyPreviews,
  modelFilters,
  modelPreviews,
} from "@/components/platform/PlatformPreview";
import { DashFrame, Pill } from "@/components/spaces/ItemSet";
import { developmentView } from "@/lib/product-copy";
import type { HostingMode } from "@/lib/types";
import { cn } from "@/lib/utils";

const requestSeries = [42, 48, 45, 61, 70, 68, 82, 90, 86, 98, 112, 108];

export function PlatformMain() {
  const {
    platformNav,
    hostingMode,
    billingPlan,
    entitlements,
    orgMembers,
    workspaceId,
    actor,
  } = useApp();
  const bill = billingFor(hostingMode, {
    seatMix: orgSeatMix(orgMembers),
    plan: billingPlan,
  });
  const shared = sharedResourcesFor(workspaceId, actor, entitlements);

  if (platformNav === "overview") {
    return (
      <Page
        title="Overview"
        kicker={developmentView.kicker}
        subtitle="Traffic, runtimes, and production capacity for this workspace."
      >
        <div className="flex flex-wrap gap-px overflow-hidden rounded-[10px] border border-border bg-border">
          <Kpi label="Requests" value="1.24M" delta="+12% vs last month" />
          <Kpi label="Completion rate" value="81%" delta="+3.1 pts" />
          <Kpi label="Uptime" value="99.97%" />
          <Kpi
            label="Development"
            value={entitlements.devDepthLabel}
          />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Traffic" hint="Last 12 weeks">
            <AreaChart values={requestSeries} />
          </ChartCard>
          <ChartCard title="Funnel" hint="This month">
            <FunnelChart
              stages={[
                { label: "Requests", value: "1.24M", pct: 100 },
                { label: "Completions", value: "1.01M", pct: 81 },
                { label: "Cache hits", value: "420k", pct: 34 },
                { label: "Routed locally", value: "88k", pct: 7 },
              ]}
            />
          </ChartCard>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Where it ran">
            <BarPair
              left={{ label: "Cloud", pct: 64 }}
              right={{ label: "Local + on-device", pct: 36 }}
            />
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              Active hosting is{" "}
              {hostingModes.find((item) => item.id === hostingMode)?.label}.
              Seats are billed in Settings → Plans. Hosting only chooses where
              inference runs.
            </p>
          </ChartCard>
          <ChartCard title="Runtime mix">
            <div className="space-y-2.5">
              {[
                { name: "On-device Gemma 4", pct: 38 },
                { name: "Cloud large", pct: 41 },
                { name: "Local LAN", pct: 21 },
              ].map((row) => (
                <div key={row.name}>
                  <div className="mb-1 flex justify-between text-[12px]">
                    <span>{row.name}</span>
                    <span className="font-mono text-muted-foreground">
                      {row.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-chart-3"
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      </Page>
    );
  }

  if (platformNav === "hosting") return <HostingPage />;

  if (platformNav === "models") {
    const managed = workspaceResources.filter(
      (item) => item.workspaceId === workspaceId && item.status === "active",
    );
    return (
      <Page
        title="Models"
        kicker="Runtime"
        subtitle="Cloud, local, and on-device models this workspace can run."
      >
        {managed.length ? (
          <div className="mb-5 space-y-2">
            {managed.map((item) => {
              const owner = memberName(item.ownerId, orgMembers);
              const authorized = shared.some((row) => row.id === item.id);
              return (
                <div
                  key={item.id}
                  className="rounded-[10px] border border-border bg-card px-4 py-3 text-[13px]"
                >
                  <p className="font-medium tracking-[-0.01em]">{item.name}</p>
                  <p className="mt-1 text-muted-foreground">
                    Managed by {owner}
                    {authorized ? " · authorized for you" : ""}
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}
        <PlatformPreviewGrid
          items={modelPreviews({ hostingMode })}
          filters={modelFilters()}
          empty="No models in this filter."
        />
      </Page>
    );
  }

  if (platformNav === "api") return <ApisPage />;

  if (platformNav === "keys") return <KeysPage />;

  if (platformNav === "deployments") {
    return (
      <Page
        title="Deployments"
        kicker="Hosting"
        subtitle="Where this workspace’s runtime is live."
      >
        <TestAccessNote />
        <PlatformPreviewGrid
          items={deploymentPreviews()}
          filters={deploymentFilters()}
          empty="No deployments in this filter."
        />
      </Page>
    );
  }

  if (platformNav === "logs") {
    return (
      <Page
        title="Logs"
        kicker="Infrastructure"
        subtitle="Recent platform traffic and errors."
      >
        <pre className="overflow-x-auto rounded-[10px] border border-border bg-card p-5 font-mono text-[12px] leading-relaxed text-muted-foreground">
          {`14:11  chat.completions  200  340ms  gemma-4-e4b  on-device
14:09  embeddings         200   22ms  cloud
14:02  chat.completions  200  180ms  local-lan`}
        </pre>
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
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Requests" hint="12 weeks">
            <AreaChart values={requestSeries} />
          </ChartCard>
          {splitAccounts ? (
            <ChartCard title="By account">
              <div className="space-y-2.5">
                {split.map((row) => (
                  <div key={row.id}>
                    <div className="mb-1 flex justify-between text-[12px]">
                      <span>{row.name}</span>
                      <span className="font-mono text-muted-foreground">
                        {row.requests} · {row.pct}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-chart-3"
                        style={{ width: `${row.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          ) : (
            <ChartCard title="This account">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Usage is pooled on Pro. Max splits requests by workspace.
              </p>
              <p className="mt-4 font-mono text-[12px] text-muted-foreground">
                1.24M requests · 12 weeks
              </p>
            </ChartCard>
          )}
        </div>
        <div className="mt-4 overflow-hidden rounded-[10px] border border-border">
          {splitAccounts
            ? split.map((row) => (
                <Row
                  key={row.id}
                  k={row.name}
                  v={`${row.requests} requests · ${row.pct}%`}
                />
              ))
            : null}
          <Row k="Cloud requests" v="1.2M · metered" />
          <Row k="Local + on-device" v="Unlimited on your hardware" />
          <Row k="Plan" v={planLabel(bill.plan)} />
          <Row
            k="Seats"
            v={`${bill.users} · ${money(bill.courier)}/month`}
          />
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
      <PlatformGrid>
        {platformDocs.map((item) => (
          <PlatformCard
            key={item.title}
            title={item.title}
            body={item.body}
            meta={item.kind}
            mono
          />
        ))}
      </PlatformGrid>
    </Page>
  );
}

function ApisPage() {
  const [extra, setExtra] = useState<typeof platformApis>([]);
  const [draft, setDraft] = useState<{ name: string; path: string } | null>(
    null,
  );
  const apis = [...extra, ...platformApis];

  const addApi = () => {
    const name = draft?.name.trim() || "Custom API";
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom";
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
      <TestAccessNote />
      {draft ? (
        <article className="mb-5 rounded-[10px] border border-border bg-card p-5">
          <p className="text-[15px] font-medium tracking-[-0.02em]">New API</p>
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
            <button
              type="button"
              onClick={addApi}
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-[13.5px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground"
            >
              Add API
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-[13.5px] font-medium tracking-[-0.01em] hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </article>
      ) : (
        <div className="mb-5">
          <Pill onClick={() => setDraft({ name: "", path: "" })}>Add API</Pill>
        </div>
      )}
      <PlatformPreviewGrid
        items={apiPreviews(apis)}
        kind="skill"
        empty="No APIs yet."
      />
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
      <TestAccessNote />
      <div className="mb-5">
        <Pill
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
        </Pill>
      </div>
      <PlatformPreviewGrid
        items={keyPreviews(keys)}
        kind="file"
        empty="No keys yet."
        onOpen={(hint) => {
          void navigator.clipboard.writeText(hint);
        }}
      />
    </Page>
  );
}

function TestAccessNote() {
  const { entitlements, openSettings } = useApp();
  const next = nextPlanTier(entitlements.plan);
  if (!next) return null;
  return (
    <div className="mb-5 rounded-[10px] border border-border bg-card px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
      {entitlements.devDepthLabel} development on {planLabel(entitlements.plan)}.
      Upgrade to {planLabel(next)} for the next tier.{" "}
      <button
        type="button"
        onClick={() => openSettings("plans")}
        className="text-foreground underline-offset-2 hover:underline"
      >
        View plans
      </button>
    </div>
  );
}

function PlatformGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  );
}

function PlatformCard({
  title,
  body,
  meta,
  mono = false,
}: {
  title: string;
  body: string;
  meta: string;
  mono?: boolean;
}) {
  return (
    <article className="rounded-[10px] border border-border bg-card p-5">
      <p className="text-[15px] font-medium tracking-[-0.02em]">{title}</p>
      <p
        className={cn(
          "mt-1.5 text-[13px] leading-relaxed text-muted-foreground",
          mono && "break-all font-mono text-[12px]",
        )}
      >
        {body}
      </p>
      <p className="mt-4 font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
        {meta}
      </p>
    </article>
  );
}

function HostingPage() {
  const { hostingMode, setHostingMode, openSettings, entitlements } = useApp();

  return (
    <Page
      title="Hosting"
      kicker="Capacity"
      subtitle="Cloud, Local, and On-device — same product, different runtimes. Not a plan."
    >
      <p className="mb-5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
        Cloud is on every plan. Local and On-device start on Pro, and are
        effectively unlimited on your hardware. Seats live in Settings.
      </p>
      <button
        type="button"
        onClick={() => openSettings("plans")}
        className="mb-5 inline-flex h-10 items-center rounded-full border border-foreground/15 px-4 text-[13.5px] font-medium tracking-[-0.01em] hover:bg-muted"
      >
        View plans
      </button>
      <PlatformPreviewGrid
        items={hostingPreviews(hostingMode).filter((item) =>
          entitlements.hostingAllowed(item.id as HostingMode),
        )}
        onOpen={(id) => {
          if (!entitlements.hostingAllowed(id as HostingMode)) return;
          setHostingMode(id as HostingMode);
        }}
        empty="No hosting options."
      />
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border px-5 py-3.5 last:border-b-0">
      <span className="text-[14px]">{k}</span>
      <span className="font-mono text-[12px] text-muted-foreground">{v}</span>
    </div>
  );
}
