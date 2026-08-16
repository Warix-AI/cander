"use client";

import { useId, type ReactNode } from "react";

export function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-card p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="text-[14px] font-medium">{title}</p>
        {hint ? (
          <p className="font-mono text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function Kpi({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string;
}) {
  return (
    <div className="min-w-[8rem] flex-1 bg-card px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[1.35rem] font-medium tracking-[-0.03em]">{value}</p>
      {delta ? (
        <p className="mt-0.5 text-[11px] text-chart-2">{delta}</p>
      ) : null}
    </div>
  );
}

export function AreaChart({ values }: { values: number[] }) {
  const id = useId().replace(/:/g, "");
  const max = Math.max(...values, 1);
  const w = 640;
  const h = 168;
  const pad = 8;
  const coords = values.map((v, i) => {
    const x = pad + (i / Math.max(values.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - (v / max) * (h - pad * 2);
    return { x, y };
  });
  const line = coords.map((p) => `${p.x},${p.y}`).join(" ");
  const fill = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;
  const last = coords[coords.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full" aria-hidden>
      <defs>
        <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-2)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((n) => (
        <line
          key={n}
          x1={pad}
          x2={w - pad}
          y1={pad + n * (h - pad * 2)}
          y2={pad + n * (h - pad * 2)}
          className="stroke-border"
          strokeWidth="1"
        />
      ))}
      <polygon points={fill} fill={`url(#fill-${id})`} />
      <polyline
        points={line}
        fill="none"
        className="stroke-chart-2"
        strokeWidth="2.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {last ? (
        <circle cx={last.x} cy={last.y} r="3.5" className="fill-chart-2" />
      ) : null}
    </svg>
  );
}

export function FunnelChart({
  stages,
}: {
  stages: { label: string; value: string; pct: number }[];
}) {
  return (
    <div className="space-y-3">
      {stages.map((stage) => (
        <div key={stage.label}>
          <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
            <span>{stage.label}</span>
            <span className="font-mono text-muted-foreground">{stage.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-chart-2"
              style={{ width: `${Math.max(stage.pct, 4)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BarPair({
  left,
  right,
}: {
  left: { label: string; pct: number };
  right: { label: string; pct: number };
}) {
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        <div className="bg-chart-2" style={{ width: `${left.pct}%` }} />
        <div className="bg-chart-3" style={{ width: `${right.pct}%` }} />
      </div>
      <div className="mt-3 flex justify-between text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-chart-2" />
          {left.label} · {left.pct}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-chart-3" />
          {right.label} · {right.pct}%
        </span>
      </div>
    </div>
  );
}
