"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Variant =
  | "hero"
  | "home"
  | "build"
  | "studio"
  | "research"
  | "work"
  | "personal"
  | "development";

export function ProductMockup({
  variant = "home",
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  if (variant === "hero") return <HeroMockup className={className} />;

  return (
    <Shell className={className} view={variant === "development" ? "development" : "home"}>
      {variant === "build" ? (
        <BuildSplit />
      ) : variant === "studio" ? (
        <StudioPane />
      ) : variant === "research" ? (
        <ResearchPane />
      ) : variant === "work" ? (
        <WorkPane />
      ) : variant === "personal" ? (
        <PersonalPane />
      ) : variant === "development" ? (
        <DevelopmentPane />
      ) : (
        <ChatPane
          user="What's on my plate today?"
          reply="Three replies in Work, a Build preview waiting, and Research notes on the Q3 scan."
        />
      )}
    </Shell>
  );
}

function HeroMockup({ className }: { className?: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setStep(3);
      return;
    }
    const t1 = window.setTimeout(() => setStep(1), 400);
    const t2 = window.setTimeout(() => setStep(2), 1400);
    const t3 = window.setTimeout(() => setStep(3), 2600);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, []);

  return (
    <Shell className={className} view="home" split={step >= 3}>
      <ChatPane
        user={step >= 1 ? "Build me a customer portal for Acme." : undefined}
        reply={step >= 2 ? "I'll use Build to make this." : undefined}
      />
      {step >= 3 ? <PreviewPane /> : null}
    </Shell>
  );
}

function Shell({
  children,
  className,
  view,
  split,
}: {
  children: React.ReactNode;
  className?: string;
  view: "home" | "development";
  split?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_16px_48px_rgba(0,0,0,0.08)]",
        className,
      )}
    >
      <div className="flex min-h-[320px] md:min-h-[420px]">
        <aside className="hidden w-[168px] shrink-0 border-r border-border bg-sidebar p-3 md:block">
          <p className="px-2 text-[11px] font-semibold tracking-[-0.02em]">Courier</p>
          <div className="mt-3 space-y-0.5">
            <NavRow active={view === "home"}>Home</NavRow>
            <NavRow active={view === "development"}>Development</NavRow>
          </div>
          <p className="mt-5 px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Spaces
          </p>
          <div className="mt-1 space-y-0.5">
            {["Work", "Build", "Studio", "Research", "Personal"].map((space) => (
              <NavRow key={space} active={view === "home" && space === "Build"}>
                {space}
              </NavRow>
            ))}
          </div>
        </aside>
        <div className={cn("flex min-w-0 flex-1", split && "flex-col md:flex-row")}>
          {children}
        </div>
      </div>
    </div>
  );
}

function NavRow({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-2 py-1.5 text-[12px]",
        active ? "bg-muted font-medium" : "text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}

function ChatPane({
  user,
  reply,
}: {
  user?: string;
  reply?: string;
}) {
  return (
    <div className="flex min-h-[280px] flex-1 flex-col p-4">
      <div className="flex-1 space-y-3">
        {user ? (
          <div className="ml-auto max-w-[80%] rounded-[18px] rounded-br-[6px] bg-muted px-3.5 py-2.5 text-[13px]">
            {user}
          </div>
        ) : null}
        {reply ? (
          <div className="max-w-[88%] text-[13px] leading-relaxed">{reply}</div>
        ) : null}
      </div>
      <div className="mt-4 h-10 rounded-full border border-border px-4 text-[12px] leading-10 text-muted-foreground">
        Message Courier
      </div>
    </div>
  );
}

function PreviewPane() {
  return (
    <div className="flex min-h-[220px] flex-1 flex-col border-t border-border md:border-l md:border-t-0">
      <div className="flex h-9 items-center gap-2 border-b border-border px-3 text-[11px] text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-chart-2" />
        acme-portal · Preview
      </div>
      <div className="relative flex-1 overflow-hidden p-4">
        <div className="rounded-[10px] border border-border bg-background p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Acme
          </p>
          <p className="mt-2 text-[16px] font-semibold tracking-[-0.03em]">
            Customer portal
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {["Orders", "Invoices", "Support"].map((label) => (
              <div
                key={label}
                className="rounded-[10px] bg-muted px-2 py-3 text-center text-[11px]"
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BuildSplit() {
  return (
    <>
      <ChatPane
        user="Ship the portal behind auth."
        reply="Preview is live. Development already has the model, API, and keys for this project."
      />
      <PreviewPane />
    </>
  );
}

function StudioPane() {
  return (
    <div className="grid flex-1 grid-cols-2 gap-3 p-4 md:grid-cols-3">
      {["Product still", "Social crop", "Campaign"].map((label, i) => (
        <div
          key={label}
          className={cn(
            "relative min-h-[120px] overflow-hidden rounded-[10px] text-white",
            i === 0 ? "media-a" : i === 1 ? "media-b" : "media-c",
          )}
        >
          <div className="grain-layer" />
          <p className="absolute bottom-3 left-3 text-[12px]">{label}</p>
        </div>
      ))}
    </div>
  );
}

function ResearchPane() {
  return (
    <div className="flex flex-1">
      <div className="flex-1 p-4">
        <p className="text-[12px] font-medium">Q3 competitive scan</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          Browser open on pricing pages. Sources saved. Draft report in notes.
        </p>
        <div className="mt-4 space-y-2">
          {["openai.com/api/pricing", "anthropic.com/pricing", "thinkrecursion.ai"].map(
            (url) => (
              <div key={url} className="rounded-[10px] border border-border px-3 py-2 font-mono text-[11px]">
                {url}
              </div>
            ),
          )}
        </div>
      </div>
      <div className="hidden w-[42%] border-l border-border bg-muted/40 p-3 md:block">
        <div className="h-full rounded-[10px] border border-border bg-background p-3">
          <p className="text-[11px] text-muted-foreground">Browser</p>
          <p className="mt-2 text-[13px] font-medium">Pricing pages</p>
        </div>
      </div>
    </div>
  );
}

function WorkPane() {
  return (
    <div className="flex-1 space-y-2 p-4">
      {[
        { from: "Inbox", body: "Reply to Northwind renewal" },
        { from: "Calendar", body: "Design review · 2:00" },
        { from: "Customers", body: "Acme — portal kickoff" },
      ].map((row) => (
        <div key={row.body} className="rounded-[10px] border border-border px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {row.from}
          </p>
          <p className="mt-1 text-[13px]">{row.body}</p>
        </div>
      ))}
    </div>
  );
}

function PersonalPane() {
  return (
    <div className="grid flex-1 grid-cols-2 gap-2 p-4">
      {["Today", "Money", "Health", "Goals"].map((label) => (
        <div key={label} className="rounded-[10px] border border-border p-3">
          <p className="text-[13px] font-medium">{label}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">Separate from product work.</p>
        </div>
      ))}
    </div>
  );
}

function DevelopmentPane() {
  return (
    <div className="flex flex-1">
      <div className="hidden w-[160px] border-r border-border p-3 md:block">
        {["Hosting", "Models", "APIs", "Keys", "Deployments", "Docs"].map((item, i) => (
          <NavRow key={item} active={i === 0}>
            {item}
          </NavRow>
        ))}
      </div>
      <div className="flex-1 p-4">
        <p className="text-[12px] font-medium">Hosting</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {["Cloud", "Local", "On-device"].map((label) => (
            <div key={label} className="rounded-[10px] border border-border p-3 text-[12.5px]">
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
