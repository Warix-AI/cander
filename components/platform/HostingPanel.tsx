"use client";

import { useMemo, useState } from "react";
import { Cloud, Cpu, HardDrive, Server } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  DataList,
  DataRow,
  GhostBtn,
  MeterCard,
  PanelToolbar,
  Section,
  SoftNote,
  StatCard,
  StatusPill,
  SummaryCard,
} from "@/components/platform/DevChrome";
import { ScopeToggle } from "@/components/spaces/ItemSet";
import { hostingModes } from "@/lib/billing";
import { demoLocalHardware, parseMemoryGb } from "@/lib/compute";
import { platformModels } from "@/lib/data";
import type { HostingMode } from "@/lib/types";
import { cn } from "@/lib/utils";

type LoadMode = "static" | "flex";

type LocalModelRow = {
  id: string;
  name: string;
  memoryGb: number;
  loadMode: LoadMode;
  loaded: boolean;
};

type Machine = {
  id: string;
  name: string;
  kind: string;
  memoryGb: number;
  usedGb: number;
  status: "online" | "idle" | "offline";
};

const DEMO_MACHINES: Machine[] = [
  {
    id: "m-office",
    name: "Office Mac Studio",
    kind: "Apple M2 Ultra · 64 GB",
    memoryGb: 64,
    usedGb: 28.4,
    status: "online",
  },
  {
    id: "m-rack",
    name: "Rack GPU-01",
    kind: "2× RTX 4090 · 48 GB",
    memoryGb: 48,
    usedGb: 31.2,
    status: "online",
  },
  {
    id: "m-lab",
    name: "Lab Mini",
    kind: "M4 Pro · 24 GB",
    memoryGb: 24,
    usedGb: 9.1,
    status: "idle",
  },
];

const DEMO_DEVICE: Machine = {
  id: "d-this",
  name: "This MacBook Pro",
  kind: "M3 Pro · 18 GB unified",
  memoryGb: demoLocalHardware.memoryGb ?? 16,
  usedGb: 11.2,
  status: "online",
};

function seedModels(
  runtime: "Local" | "On-device",
  machineId: string,
  salt: number,
): LocalModelRow[] {
  return platformModels
    .filter((model) => model.runtime === runtime)
    .map((model, index) => {
      const memoryGb = parseMemoryGb(model.memory) ?? 4;
      const loadMode: LoadMode = (index + salt) % 2 === 0 ? "static" : "flex";
      const loaded =
        loadMode === "static" || (index + salt) % 3 === 0;
      return {
        id: `${machineId}-${model.name}`,
        name: model.name,
        memoryGb,
        loadMode,
        loaded,
      };
    });
}

function seedModelsByMachine(
  machines: Machine[],
  runtime: "Local" | "On-device",
): Record<string, LocalModelRow[]> {
  const map: Record<string, LocalModelRow[]> = {};
  machines.forEach((machine, index) => {
    map[machine.id] = seedModels(runtime, machine.id, index);
  });
  return map;
}

export function HostingPanel() {
  const { hostingMode, setHostingMode, openSettings, entitlements } = useApp();

  const options = useMemo(
    () =>
      hostingModes
        .filter((mode) => entitlements.hostingAllowed(mode.id))
        .map((mode) => ({ id: mode.id, label: mode.label })),
    [entitlements],
  );

  const active = options.some((item) => item.id === hostingMode)
    ? hostingMode
    : ((options[0]?.id as HostingMode) ?? "cloud");

  const mode = hostingModes.find((item) => item.id === active) ?? hostingModes[0];

  const select = (id: string) => {
    if (!entitlements.hostingAllowed(id as HostingMode)) return;
    setHostingMode(id as HostingMode);
  };

  return (
    <div>
      <PanelToolbar
        trailing={
          <GhostBtn onClick={() => openSettings("plans")}>View plans</GhostBtn>
        }
      >
        <ScopeToggle value={active} onChange={select} options={options} />
      </PanelToolbar>

      <div className="mt-3">
        <SoftNote>
          Hosting chooses where inference runs. Seats and Development depth are on
          Plans.
        </SoftNote>
      </div>

      <SummaryCard title={mode.title} badge="Active" body={mode.body} detail={mode.why} />

      <div className="mt-6 space-y-6">
        {active === "cloud" ? <CloudDetail /> : null}
        {active === "local" ? <LocalDetail multiMachine /> : null}
        {active === "on-device" ? <LocalDetail multiMachine={false} /> : null}
      </div>
    </div>
  );
}

function CloudDetail() {
  const usage = [
    { label: "Tokens this period", used: 12.4, limit: 40, unit: "M" },
    { label: "Requests", used: 84_200, limit: 250_000, unit: "" },
    { label: "Seat fair-use", used: 62, limit: 100, unit: "%" },
  ];

  const rows = [
    { k: "Region", v: "us-east-1 · Recursion operated" },
    { k: "Runtime", v: "OpenAI-compatible · metered" },
    { k: "Latency", v: "~180 ms p50 (demo)" },
    {
      k: "Models live",
      v: `${platformModels.filter((m) => m.runtime === "Cloud").length} routed`,
    },
  ];

  return (
    <>
      <Section
        title="Usage"
        description="Included cloud capacity for this billing period. Overages bill to the org seat."
      >
        <div className="space-y-3">
          {usage.map((item) => {
            const pct = Math.min(100, (item.used / item.limit) * 100);
            const usedLabel =
              item.unit === "M"
                ? `${item.used}M / ${item.limit}M`
                : item.unit === "%"
                  ? `${item.used}% of fair-use`
                  : `${item.used.toLocaleString()} / ${item.limit.toLocaleString()}`;
            return (
              <MeterCard
                key={item.label}
                label={item.label}
                valueLabel={usedLabel}
                pct={pct}
              />
            );
          })}
        </div>
      </Section>

      <Section title="Cloud capacity">
        <DataList>
          {rows.map((row) => (
            <DataRow key={row.k} label={row.k} value={row.v} />
          ))}
        </DataList>
      </Section>

      <Section title="What Cloud covers">
        <ul className="space-y-2">
          {hostingModes[0].traits.map((trait) => (
            <li
              key={trait}
              className="flex items-start gap-2 text-[13.5px] text-muted-foreground"
            >
              <Cloud
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/50"
                strokeWidth={1.6}
              />
              {trait}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function LocalDetail({ multiMachine }: { multiMachine: boolean }) {
  const machines = multiMachine ? DEMO_MACHINES : [DEMO_DEVICE];
  const runtime = multiMachine ? "Local" : "On-device";
  const [selectedId, setSelectedId] = useState(machines[0].id);
  const [modelsByMachine, setModelsByMachine] = useState(() =>
    seedModelsByMachine(machines, runtime),
  );

  const selected =
    machines.find((item) => item.id === selectedId) ?? machines[0];
  const models = modelsByMachine[selected.id] ?? [];

  const totalRam = selected.memoryGb;
  const usedRam = models
    .filter((item) => item.loaded)
    .reduce((sum, item) => sum + item.memoryGb, 0);
  const available = Math.max(0, totalRam - usedRam);
  const queued = models.filter((item) => item.loadMode === "flex" && !item.loaded);
  const staticLoaded = models.filter(
    (item) => item.loadMode === "static" && item.loaded,
  );

  const patchModels = (
    machineId: string,
    updater: (rows: LocalModelRow[]) => LocalModelRow[],
  ) => {
    setModelsByMachine((current) => ({
      ...current,
      [machineId]: updater(current[machineId] ?? []),
    }));
  };

  const setLoadMode = (id: string, loadMode: LoadMode) => {
    patchModels(selected.id, (rows) =>
      rows.map((item) => {
        if (item.id !== id) return item;
        if (loadMode === "static") {
          return { ...item, loadMode, loaded: true };
        }
        return { ...item, loadMode, loaded: false };
      }),
    );
  };

  const toggleLoaded = (id: string) => {
    patchModels(selected.id, (rows) =>
      rows.map((item) =>
        item.id === id ? { ...item, loaded: !item.loaded } : item,
      ),
    );
  };

  return (
    <>
      <Section
        title={multiMachine ? "Machines on this network" : "This device"}
        description={
          multiMachine
            ? "Select a machine to inspect its memory budget and models."
            : "On-device is a single machine — this one."
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {machines.map((machine) => {
            const selectedMachine = machine.id === selected.id;
            return (
              <button
                key={machine.id}
                type="button"
                onClick={() => setSelectedId(machine.id)}
                aria-pressed={selectedMachine}
                className={cn(
                  "rounded-[10px] border bg-card p-4 text-left transition-colors duration-200",
                  selectedMachine
                    ? "border-foreground/45 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--foreground)_18%,transparent)]"
                    : "border-border hover:border-foreground/20",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium tracking-[-0.01em]">
                      {machine.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">
                      {machine.kind}
                    </p>
                  </div>
                  <StatusPill
                    tone={
                      machine.status === "online"
                        ? "active"
                        : machine.status === "idle"
                          ? "muted"
                          : "outline"
                    }
                  >
                    {machine.status}
                  </StatusPill>
                </div>
                <div className="mt-3">
                  <div className="mb-1.5 flex justify-between text-[12px] text-muted-foreground">
                    <span>Memory</span>
                    <span className="font-mono">
                      {machine.usedGb.toFixed(1)} / {machine.memoryGb} GB
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-chart-2"
                      style={{
                        width: `${Math.min(100, (machine.usedGb / machine.memoryGb) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title={`Memory budget · ${selected.name}`}
        description="Static models stay loaded. Flex models queue until you start typing — then they load themselves."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            icon={HardDrive}
            label="Available"
            value={`${available.toFixed(1)} GB`}
          />
          <StatCard
            icon={Cpu}
            label="In memory"
            value={`${usedRam.toFixed(1)} GB`}
          />
          <StatCard
            icon={Server}
            label="Queued (flex)"
            value={`${queued.length}`}
          />
        </div>
      </Section>

      <Section title={`Models · ${selected.name}`}>
        <DataList>
          {models.map((model) => {
            const fits =
              model.memoryGb <= available + (model.loaded ? model.memoryGb : 0);
            return (
              <div
                key={model.id}
                className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-medium tracking-[-0.01em]">
                      {model.name}
                    </p>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {model.memoryGb} GB
                    </span>
                    {model.loaded ? (
                      <StatusPill tone="muted">Loaded</StatusPill>
                    ) : model.loadMode === "flex" ? (
                      <StatusPill tone="outline">Queued</StatusPill>
                    ) : null}
                    {!fits && !model.loaded ? (
                      <StatusPill tone="danger">Needs more RAM</StatusPill>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    {model.loadMode === "flex"
                      ? "Loads into memory when you start typing."
                      : "Kept in memory while this runtime is active."}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <LoadModeToggle
                    value={model.loadMode}
                    onChange={(next) => setLoadMode(model.id, next)}
                  />
                  <button
                    type="button"
                    onClick={() => toggleLoaded(model.id)}
                    className={cn(
                      "inline-flex h-8 w-[5.75rem] shrink-0 items-center justify-center rounded-full border px-3 text-[12px] font-medium tracking-[-0.01em]",
                      model.loaded
                        ? "border-foreground/20 bg-muted"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {model.loaded ? "Unload" : "Load now"}
                  </button>
                </div>
              </div>
            );
          })}
        </DataList>
        {staticLoaded.length || queued.length ? (
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            {staticLoaded.length} static model
            {staticLoaded.length === 1 ? "" : "s"} pinned in memory
            {queued.length
              ? ` · ${queued.length} flex waiting to load on first token`
              : ""}
            .
          </p>
        ) : null}
      </Section>
    </>
  );
}

function LoadModeToggle({
  value,
  onChange,
}: {
  value: LoadMode;
  onChange: (next: LoadMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-[10px] border border-foreground/12 p-0.5">
      {(["static", "flex"] as const).map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "inline-flex h-7 items-center rounded-[8px] px-2.5 text-[12px] font-medium tracking-[-0.01em] capitalize transition-colors duration-200",
            value === id
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {id}
        </button>
      ))}
    </div>
  );
}

