"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Bell, ChevronDown, Mail, Plus, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { connectors } from "@/lib/data";
import {
  getConnectorConnectionsServerSnapshot,
  getConnectorConnectionsSnapshot,
  subscribeConnectorConnections,
} from "@/lib/connector-connections-store";
import { isUiConnectedStatus } from "@/lib/connectors/authz";
import {
  expertCatalogEntry,
  EXPERT_ICON_SRC,
} from "@/lib/expert-catalog";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

type AppPick = {
  connectionId: string;
  connectorId: string;
  label: string;
};

type Destination = "notifications" | "email";
type Cadence = "day" | "week" | "month";

type ExpertJob = {
  id: string;
  apps: AppPick[];
  destination: Destination;
  cadence: Cadence;
};

const DEST_LABEL: Record<Destination, string> = {
  notifications: "notification center",
  email: "email",
};

const CADENCE_LABEL: Record<Cadence, string> = {
  day: "every day",
  week: "every week",
  month: "every month",
};

const CADENCE_SHORT: Record<Cadence, string> = {
  day: "daily",
  week: "weekly",
  month: "monthly",
};

const MAX_JOBS = 4;

function newJob(): ExpertJob {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    apps: [],
    destination: "notifications",
    cadence: "day",
  };
}

/** Short tab label — placeholder until real AI titles; mirrors sentence content. */
function jobTabLabel(job: ExpertJob, index: number): string {
  if (job.apps.length === 0) return `Job ${index + 1}`;
  const first = connectors.find((c) => c.id === job.apps[0].connectorId)?.name
    ?? job.apps[0].label.split(/\s+/)[0]
    ?? "App";
  const words = [first, CADENCE_SHORT[job.cadence]];
  if (job.apps.length > 1) words.splice(1, 0, `+${job.apps.length - 1}`);
  return words.slice(0, 4).join(" ");
}

/**
 * Venmo-style sentence builder for catalog Experts.
 * Header = job tabs (Job 1 + …); body = one sentence per active job.
 */
export function ExpertSetupView({ expertId }: { expertId: string }) {
  const { workspaceId } = useApp();
  const expert = expertCatalogEntry(expertId);
  const verb = expert?.kind ?? "Expert";

  const byWorkspace = useSyncExternalStore(
    subscribeConnectorConnections,
    getConnectorConnectionsSnapshot,
    getConnectorConnectionsServerSnapshot,
  );

  const connectedApps = useMemo(() => {
    const rows = byWorkspace[workspaceId] ?? [];
    return rows
      .filter((row) => isUiConnectedStatus(row.status))
      .map((row) => {
        const meta = connectors.find((c) => c.id === row.connectorId);
        return {
          connectionId: row.id,
          connectorId: row.connectorId,
          label: row.displayName || meta?.name || row.connectorId,
          icon: meta?.icon ?? row.connectorId,
        };
      });
  }, [byWorkspace, workspaceId]);

  const [jobs, setJobs] = useState<ExpertJob[]>(() => [newJob()]);
  const [activeJobId, setActiveJobId] = useState(() => jobs[0]!.id);
  const [picker, setPicker] = useState<"app" | "dest" | "cadence" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const activeJob = jobs.find((j) => j.id === activeJobId) ?? jobs[0]!;

  useEffect(() => {
    const job = newJob();
    setJobs([job]);
    setActiveJobId(job.id);
    setPicker(null);
  }, [expertId]);

  useEffect(() => {
    if (!jobs.some((j) => j.id === activeJobId)) {
      setActiveJobId(jobs[0]!.id);
    }
  }, [jobs, activeJobId]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPicker(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const updateActive = (patch: Partial<ExpertJob>) => {
    setJobs((current) =>
      current.map((job) =>
        job.id === activeJob.id ? { ...job, ...patch } : job,
      ),
    );
  };

  const addApp = (pick: AppPick) => {
    if (activeJob.apps.some((a) => a.connectionId === pick.connectionId)) {
      setPicker(null);
      return;
    }
    updateActive({ apps: [...activeJob.apps, pick] });
    setPicker(null);
  };

  const removeApp = (connectionId: string) => {
    updateActive({
      apps: activeJob.apps.filter((a) => a.connectionId !== connectionId),
    });
  };

  const addJob = () => {
    if (jobs.length >= MAX_JOBS) return;
    const job = newJob();
    setJobs((current) => [...current, job]);
    setActiveJobId(job.id);
    setPicker(null);
  };

  return (
    <div
      ref={rootRef}
      className="flex min-h-full flex-1 flex-col bg-transparent"
    >
      <div className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col px-6 pb-16 pt-10 sm:px-10 sm:pt-14">
        <div className="mb-10 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={expert?.icon ?? EXPERT_ICON_SRC}
            alt=""
            className="h-9 w-9 rounded-[10px] object-cover"
          />
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {jobs.map((job, index) => {
              const selected = job.id === activeJob.id;
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => {
                    setActiveJobId(job.id);
                    setPicker(null);
                  }}
                  className={cn(
                    "max-w-[9.5rem] truncate rounded-full px-2.5 py-1 text-[13px] tracking-[-0.01em] transition-colors",
                    selected
                      ? "bg-foreground/[0.08] font-medium text-foreground dark:bg-white/[0.1]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {jobTabLabel(job, index)}
                </button>
              );
            })}
            {jobs.length < MAX_JOBS ? (
              <button
                type="button"
                aria-label="Add job"
                onClick={addJob}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <Plus className="h-4 w-4" strokeWidth={2.2} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-3 text-[28px] font-medium leading-[1.35] tracking-[-0.03em] text-foreground sm:text-[32px]">
          <span>{verb}</span>

          {activeJob.apps.length === 0 ? (
            <ChipButton
              active={picker === "app"}
              onClick={() => setPicker(picker === "app" ? null : "app")}
              placeholder
            >
              an app
            </ChipButton>
          ) : (
            activeJob.apps.map((app, index) => (
              <span
                key={app.connectionId}
                className="inline-flex items-baseline gap-x-2"
              >
                {index > 0 ? (
                  <span className="font-normal text-muted-foreground/70">,</span>
                ) : null}
                <AppChip
                  connectorId={app.connectorId}
                  label={app.label}
                  onRemove={() => removeApp(app.connectionId)}
                />
              </span>
            ))
          )}

          {activeJob.apps.length > 0 ? (
            <ChipButton
              active={picker === "app"}
              onClick={() => setPicker(picker === "app" ? null : "app")}
              placeholder
              className="text-[22px] sm:text-[24px]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.2} />
              app
            </ChipButton>
          ) : null}

          <span className="font-normal text-muted-foreground/70">and place</span>
          <span className="font-normal text-muted-foreground/70">results in</span>

          <ChipButton
            active={picker === "dest"}
            onClick={() => setPicker(picker === "dest" ? null : "dest")}
          >
            {activeJob.destination === "notifications" ? (
              <Bell className="h-4 w-4" strokeWidth={1.8} />
            ) : (
              <Mail className="h-4 w-4" strokeWidth={1.8} />
            )}
            {DEST_LABEL[activeJob.destination]}
            <ChevronDown className="h-3.5 w-3.5 opacity-50" strokeWidth={2} />
          </ChipButton>

          <ChipButton
            active={picker === "cadence"}
            onClick={() => setPicker(picker === "cadence" ? null : "cadence")}
          >
            {CADENCE_LABEL[activeJob.cadence]}
            <ChevronDown className="h-3.5 w-3.5 opacity-50" strokeWidth={2} />
          </ChipButton>
        </div>

        {picker === "app" ? (
          <PickerCard title="Connected apps" className="mt-6">
            {connectedApps.length === 0 ? (
              <p className="px-1 py-3 text-[14px] text-muted-foreground">
                Connect an app from Apps first, then pick it here.
              </p>
            ) : (
              connectedApps.map((app) => {
                const selected = activeJob.apps.some(
                  (a) => a.connectionId === app.connectionId,
                );
                return (
                  <button
                    key={app.connectionId}
                    type="button"
                    disabled={selected}
                    onClick={() =>
                      addApp({
                        connectionId: app.connectionId,
                        connectorId: app.connectorId,
                        label: app.label,
                      })
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2.5 text-left transition-colors",
                      selected ? "opacity-40" : "hover:bg-muted/60",
                    )}
                  >
                    <ConnectorMark id={app.icon} size="nav" />
                    <span className="min-w-0 flex-1 truncate text-[15px] tracking-[-0.01em]">
                      {app.label}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {connectors.find((c) => c.id === app.connectorId)?.name}
                    </span>
                  </button>
                );
              })
            )}
          </PickerCard>
        ) : null}

        {picker === "dest" ? (
          <PickerCard title="Deliver results" className="mt-6">
            {(
              [
                ["notifications", "Notification center", Bell],
                ["email", "Email", Mail],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  updateActive({ destination: id });
                  setPicker(null);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2.5 text-left transition-colors hover:bg-muted/60",
                  activeJob.destination === id && "bg-muted/50",
                )}
              >
                <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} />
                <span className="text-[15px] tracking-[-0.01em]">{label}</span>
              </button>
            ))}
          </PickerCard>
        ) : null}

        {picker === "cadence" ? (
          <PickerCard title="How often" className="mt-6">
            {(
              [
                ["day", "Every day"],
                ["week", "Every week"],
                ["month", "Every month"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  updateActive({ cadence: id });
                  setPicker(null);
                }}
                className={cn(
                  "flex w-full items-center rounded-[12px] px-2.5 py-2.5 text-left text-[15px] tracking-[-0.01em] transition-colors hover:bg-muted/60",
                  activeJob.cadence === id && "bg-muted/50",
                )}
              >
                {label}
              </button>
            ))}
          </PickerCard>
        ) : null}
      </div>
    </div>
  );
}

function ChipButton({
  children,
  onClick,
  active,
  placeholder = false,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  placeholder?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 align-baseline transition-colors",
        placeholder
          ? "border border-dashed border-foreground/25 font-normal text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          : "bg-foreground/[0.06] font-medium text-foreground hover:bg-foreground/[0.1] dark:bg-white/[0.08]",
        active && "ring-2 ring-[var(--shell-select)]/50",
        className,
      )}
    >
      {children}
    </button>
  );
}

function AppChip({
  connectorId,
  label,
  onRemove,
}: {
  connectorId: string;
  label: string;
  onRemove: () => void;
}) {
  const icon =
    connectors.find((c) => c.id === connectorId)?.icon ?? connectorId;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] py-0.5 pr-1 pl-2 dark:bg-white/[0.08]">
      <ConnectorMark id={icon} size="nav" />
      <span className="max-w-[12rem] truncate text-[0.85em] font-medium tracking-[-0.02em]">
        {label}
      </span>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </span>
  );
}

function PickerCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "shell-glass-pill w-full max-w-md overflow-hidden p-2",
        SHELL_G3_RADIUS,
        className,
      )}
    >
      <p className="px-2.5 pb-1.5 pt-1.5 text-[12px] font-medium tracking-[-0.01em] text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
