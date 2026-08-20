import type { ReactNode } from "react";
import {
  handshakeArchitecture,
  handshakeOverview,
  handshakePositioning,
} from "@/lib/handshake";

export function OverviewPage() {
  return (
    <div className="space-y-5 p-4">
      <section className="rounded-[10px] border border-border bg-card p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          AI Readiness
        </p>
        <p className="mt-2 text-4xl font-medium tracking-[-0.03em]">
          {handshakeOverview.readinessScore}%
        </p>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {handshakePositioning}
        </p>
      </section>

      <section className="rounded-[10px] border border-border bg-card p-5">
        <p className="text-[13px] font-medium tracking-[-0.01em]">Architecture</p>
        <div className="mt-3 space-y-1 font-mono text-[11.5px] text-muted-foreground">
          {handshakeArchitecture.map((row, index) => (
            <div key={row} className="flex items-center gap-2">
              {index > 0 ? <span className="text-foreground/40">↓</span> : null}
              <span>{row}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Card title="Connected Agents">
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {handshakeOverview.connectedAgents.map((agent) => (
              <li key={agent.name} className="flex items-center justify-between">
                <span>{agent.name}</span>
                <Badge tone="success">{agent.status}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-muted-foreground">Future providers</p>
          <p className="mt-1 text-[13px]">
            {handshakeOverview.futureProviders.join(" · ")}
          </p>
        </Card>
        <Card title="Active Capabilities">
          <ul className="mt-2 space-y-1 text-[13px] text-muted-foreground">
            {handshakeOverview.activeCapabilities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      </section>

      <Card title="Recent Handshakes">
        <ul className="mt-2 space-y-2">
          {handshakeOverview.recentHandshakes.map((item) => (
            <li
              key={item}
              className="rounded-lg border border-border/70 px-3 py-2 text-[13px]"
            >
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[10px] border border-border bg-card p-4">
      <p className="text-[13px] font-medium tracking-[-0.01em]">{title}</p>
      {children}
    </section>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "success" | "neutral" | "warn";
}) {
  const cls =
    tone === "success"
      ? "border-chart-2/30 bg-chart-2/10 text-chart-2"
      : tone === "warn"
        ? "border-chart-3/30 bg-chart-3/10 text-chart-3"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {children}
    </span>
  );
}
