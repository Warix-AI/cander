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
  estimateFor,
  hostingModes,
  money,
  type ProductSlice,
} from "@/lib/billing";
import { account, apiKeys, platformModels } from "@/lib/data";
import { cn } from "@/lib/utils";

const requestSeries = [42, 48, 45, 61, 70, 68, 82, 90, 86, 98, 112, 108];

export function PlatformMain() {
  const { platformNav, hostingMode, apiEnabled } = useApp();
  const bill = billingFor(hostingMode, { apiEnabled });

  if (platformNav === "overview") {
    return (
      <Page title="Overview" kicker="Courier Platform">
        <div className="flex flex-wrap gap-px overflow-hidden rounded-[10px] border border-border bg-border">
          <Kpi label="Requests" value="1.24M" delta="+12% vs last month" />
          <Kpi label="Completion rate" value="81%" delta="+3.1 pts" />
          <Kpi label="Uptime" value="99.97%" />
          <Kpi
            label="This month"
            value={apiEnabled ? money(bill.api) : "—"}
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
              Courier is per user. APIs are a fixed monthly license on that
              same model.
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
    return (
      <Page title="Models" kicker="Runtime">
        <div className="overflow-hidden rounded-[10px] border border-border">
          {platformModels.map((model) => (
            <div
              key={model.name}
              className="flex items-baseline justify-between gap-4 border-b border-border px-5 py-4 last:border-b-0"
            >
              <div>
                <p className="text-[15px] font-medium tracking-[-0.02em]">
                  {model.name}
                </p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {model.runtime} · {model.memory}
                </p>
              </div>
              <p className="font-mono text-[12px] text-muted-foreground">
                {model.status}
              </p>
            </div>
          ))}
        </div>
      </Page>
    );
  }

  if (platformNav === "api") {
    return (
      <Page title="APIs" kicker="OpenAI-compatible">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[10px] border border-border bg-card p-5">
            <p className="text-[14px] font-medium">Chat completions</p>
            <pre className="mt-3 overflow-x-auto font-mono text-[12px] leading-relaxed text-muted-foreground">
              {`POST https://api.courier.dev/v1/chat/completions
Authorization: Bearer crr_live_••••`}
            </pre>
          </div>
          <div className="rounded-[10px] border border-border bg-card p-5">
            <p className="text-[14px] font-medium">Embeddings</p>
            <pre className="mt-3 overflow-x-auto font-mono text-[12px] leading-relaxed text-muted-foreground">
              {`POST https://api.courier.dev/v1/embeddings
Authorization: Bearer crr_live_••••`}
            </pre>
          </div>
        </div>
      </Page>
    );
  }

  if (platformNav === "keys") {
    return (
      <Page title="Keys" kicker="Developers">
        <div className="overflow-hidden rounded-[10px] border border-border">
          {apiKeys.map((key) => (
            <div
              key={key.name}
              className="flex items-baseline justify-between gap-4 border-b border-border px-5 py-4 last:border-b-0"
            >
              <div>
                <p className="text-[15px] font-medium">{key.name}</p>
                <p className="mt-0.5 font-mono text-[12px] text-muted-foreground">
                  {key.hint}
                </p>
              </div>
              <p className="font-mono text-[12px] text-muted-foreground">
                {key.created}
              </p>
            </div>
          ))}
        </div>
      </Page>
    );
  }

  if (platformNav === "deployments") {
    return (
      <Page title="Deployments" kicker="Hosting">
        <div className="overflow-hidden rounded-[10px] border border-border">
          <Row k="Cloud · us-east-1" v="Active" />
          <Row k="Local · office LAN" v="Standby" />
          <Row k="On-device · this Mac" v="Ready" />
        </div>
      </Page>
    );
  }

  if (platformNav === "logs") {
    return (
      <Page title="Logs" kicker="Infrastructure">
        <pre className="overflow-x-auto rounded-[10px] border border-border bg-card p-5 font-mono text-[12px] leading-relaxed text-muted-foreground">
          {`14:11  chat.completions  200  340ms  gemma-4-e4b  on-device
14:09  embeddings         200   22ms  cloud
14:02  chat.completions  200  180ms  local-lan`}
        </pre>
      </Page>
    );
  }

  if (platformNav === "usage") {
    return (
      <Page title="Usage" kicker="Analytics">
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Requests" hint="12 weeks">
            <AreaChart values={requestSeries} />
          </ChartCard>
          <ChartCard title="Outcome funnel">
            <FunnelChart
              stages={[
                { label: "Started", value: "1.24M", pct: 100 },
                { label: "Streamed", value: "1.18M", pct: 95 },
                { label: "Completed", value: "1.01M", pct: 81 },
                { label: "Cached next hit", value: "420k", pct: 34 },
              ]}
            />
          </ChartCard>
        </div>
        <div className="mt-4 overflow-hidden rounded-[10px] border border-border">
          <Row k="Cloud requests" v="1.2M" />
          <Row k="Local + on-device tokens" v="Unmetered" />
          <Row k="API license" v={apiEnabled ? money(bill.api) : "Not enabled"} />
          <Row k="Billed on Organization" v={money(bill.total)} />
        </div>
      </Page>
    );
  }

  return (
    <Page title="Docs & SDK" kicker="Developers">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { title: "TypeScript", body: "npm i @courier/sdk" },
          { title: "Python", body: "pip install courier" },
          { title: "Gateway", body: "OpenAI-compatible /v1" },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-[10px] border border-border bg-card p-5"
          >
            <p className="text-[15px] font-medium">{item.title}</p>
            <p className="mt-2 font-mono text-[12px] text-muted-foreground">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </Page>
  );
}

function HostingPage() {
  const { hostingMode, setHostingMode } = useApp();
  const [slice, setSlice] = useState<ProductSlice>("both");
  const users = account.seats;

  return (
    <Page
      title="Hosting"
      kicker="Capacity"
      actions={
        <div className="inline-flex h-10 items-center rounded-[10px] border border-foreground/12 p-0.5">
          {(
            [
              { id: "courier", label: "Courier" },
              { id: "apis", label: "APIs" },
              { id: "both", label: "Both" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSlice(item.id)}
              className={cn(
                "h-9 rounded-[10px] px-3 text-[12.5px] font-medium tracking-[-0.01em] transition-colors duration-200",
                slice === item.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      }
    >
      <p className="mb-5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
        One hosting model for the organization. Courier is billed per user. APIs
        are a fixed monthly license. The model you choose sets both prices.
      </p>
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        {hostingModes.map((mode) => {
          const estimate = estimateFor(mode.id, users);
          const active = hostingMode === mode.id;
          return (
            <article
              key={mode.id}
              className={cn(
                "flex min-h-[38rem] flex-col rounded-[10px] border p-6",
                active
                  ? "border-foreground/25 bg-card"
                  : "border-border bg-card/40",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[1.15rem] font-medium tracking-[-0.03em]">
                  {mode.label}
                </p>
                {active ? (
                  <span className="rounded-full bg-chart-2/20 px-2.5 py-0.5 text-[11px] font-medium text-chart-2">
                    Current
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
                {mode.body}
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                {mode.why}
              </p>
              <ul className="mt-5 space-y-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {mode.traits.map((trait) => (
                  <li key={trait}>· {trait}</li>
                ))}
              </ul>

              <div className="mt-6 flex-1 rounded-[10px] border border-border bg-background/60 p-4">
                {slice === "courier" ? (
                  <>
                    <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                      Courier
                    </p>
                    <p className="mt-2 text-[1.35rem] font-medium tracking-[-0.03em]">
                      {money(estimate.seat)}
                      <span className="ml-1 text-[13px] font-normal text-muted-foreground">
                        /user/month
                      </span>
                    </p>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                      Billed per active Courier user on this hosting model.
                    </p>
                  </>
                ) : null}

                {slice === "apis" ? (
                  <>
                    <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                      API license
                    </p>
                    <p className="mt-2 text-[1.35rem] font-medium tracking-[-0.03em]">
                      {money(estimate.license)}
                      <span className="ml-1 text-[13px] font-normal text-muted-foreground">
                        /month
                      </span>
                    </p>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                      Courier Platform license. Not a per-user seat. You can
                      take this without Courier.
                    </p>
                  </>
                ) : null}

                {slice === "both" ? (
                  <>
                    <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                      Combined
                    </p>
                    <div className="mt-3 flex items-baseline justify-between gap-3 text-[13.5px]">
                      <span>Courier</span>
                      <span className="font-mono">
                        {money(estimate.seat)}/user/month
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[13.5px]">
                      <span>APIs</span>
                      <span className="font-mono">
                        {money(estimate.license)}/month
                      </span>
                    </div>
                    <p className="mt-4 font-mono text-[11.5px] text-muted-foreground">
                      Users × {money(estimate.seat)} + {money(estimate.license)}
                      /month
                    </p>
                    <div className="mt-3 border-t border-border pt-3 text-[13px]">
                      <p className="text-muted-foreground">
                        Courier · {users} × {money(estimate.seat)} ={" "}
                        {money(estimate.courier)}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        APIs · {money(estimate.api)}
                      </p>
                      <p className="mt-3 text-[15px] font-medium tracking-[-0.02em]">
                        Estimated total: {money(estimate.total)}/month
                      </p>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="mt-auto pt-6">
                <p className="mb-3 text-[12.5px] text-muted-foreground">
                  {active
                    ? `Current status · ${mode.title} is active for this organization.`
                    : `Standby · switch to ${mode.label} to reprice Courier seats and the API license.`}
                </p>
                <button
                  type="button"
                  onClick={() => setHostingMode(mode.id)}
                  className={cn(
                    "inline-flex h-10 w-full items-center justify-center rounded-full px-4 text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-200",
                    active
                      ? "border border-foreground/15 bg-muted"
                      : "bg-primary text-primary-foreground hover:bg-foreground",
                  )}
                >
                  {active ? "Current Hosting" : mode.action}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </Page>
  );
}

function Page({
  title,
  kicker,
  actions,
  children,
}: {
  title: string;
  kicker: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
            {kicker}
          </p>
          <h1 className="heading-display mt-2 text-[1.8rem]">{title}</h1>
        </div>
        {actions}
      </div>
      <div className="mt-8">{children}</div>
    </div>
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
