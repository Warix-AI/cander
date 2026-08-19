"use client";

import { useState } from "react";
import { Check, Mail, Minus } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { PreviewAccount } from "@/components/settings/PreviewAccount";
import {
  appPlans,
  billingFor,
  comparisonGroups,
  cycleAmount,
  cycleSuffix,
  money,
  orgSeatMix,
  planLabel,
  pricingFaqs,
  seatMixLabel,
  type BillingCycle,
  type CompareValue,
} from "@/lib/billing";
import { orgMembersOf } from "@/lib/entitlements";
import { cn } from "@/lib/utils";

export function PlansSettings() {
  const {
    actor,
    entitlements,
    setBillingPlan,
    hostingMode,
    orgMembers,
  } = useApp();
  const [cycle, setCycle] = useState<BillingCycle>("month");
  const roster = orgMembersOf(orgMembers);
  const seatMix = orgSeatMix(orgMembers);
  const bill = billingFor(hostingMode, {
    seatMix: entitlements.showPlansBilling
      ? seatMix
      : {
          free: entitlements.plan === "free" ? 1 : 0,
          pro: entitlements.plan === "pro" ? 1 : 0,
          max: entitlements.plan === "max" ? 1 : 0,
          ultra: entitlements.plan === "ultra" ? 1 : 0,
        },
    plan: entitlements.plan,
  });
  const seatTotal = cycleAmount(bill.courier, cycle);
  const mixSummary = seatMixLabel(seatMix).join(" · ");

  return (
    <div className="pb-10">
      <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
        Plans
      </p>
      <h2
        id="settings-title"
        className="heading-display mt-2 max-w-xl text-[1.85rem]"
      >
        Courier for people. Development for what they build.
      </h2>
      <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-muted-foreground">
        Pro, Max, and Ultra. Every paid tier includes Development — depth
        increases as you move up. Org billing is per seat by plan.
      </p>

      <div className="mt-6">
        <PreviewAccount />
      </div>

      {entitlements.showInviteWall ? (
        <div className="mt-6 rounded-[10px] border border-border bg-card p-5">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            Acme invite
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            Acme is a Max organization. A Max or Ultra seat is required to use
            shared workspaces. Ask an admin to add one, or stay on your personal{" "}
            {planLabel(entitlements.plan)} account.
          </p>
        </div>
      ) : null}

      {entitlements.isMember ? (
        <div className="mt-6 rounded-[10px] border border-border bg-card p-5">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            This seat
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            You are on {planLabel(entitlements.plan)}, billed to Acme. Billing is
            managed by the Owner. Development depth:{" "}
            {entitlements.devDepthLabel.toLowerCase()}.
          </p>
        </div>
      ) : null}

      {entitlements.showPlansBilling ? (
        <div className="mt-6 rounded-[10px] border border-border bg-card p-5">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            This organization
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <BillStat k="Seat mix" v={mixSummary || "None"} />
            <BillStat
              k="Total"
              v={`${money(seatTotal)}${bill.courier ? cycleSuffix(cycle) : ""}`}
            />
          </div>
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            Each member is billed at their plan rate — Pro, Max, or Ultra.
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          Signed in as{" "}
          <span className="text-foreground">{actor.name}</span>
          {" · "}
          {planLabel(entitlements.plan)}
          {entitlements.orgActive ? ` · ${entitlements.role}` : ""}
          {entitlements.showInviteWall ? " · pending invite" : ""}.
        </p>
        <CycleToggle cycle={cycle} onChange={setCycle} />
      </div>

      {!entitlements.isMember ? (
        <>
          {entitlements.plan === "free" ? (
            <div className="mt-6 rounded-[10px] border border-border bg-card p-5">
              <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                Your plan
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                You&apos;re on Free — chat and Spaces. Development starts on
                Pro. Pick a plan below to upgrade.
              </p>
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {appPlans.map((plan) => {
            const current = entitlements.plan === plan.id;
            const amount = cycleAmount(plan.price, cycle);
            const orgLocked =
              entitlements.orgActive && entitlements.plan !== plan.id;
            return (
              <article
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-[10px] border bg-card p-6",
                  plan.popular
                    ? "border-foreground/25 ring-1 ring-foreground/10"
                    : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
                      {plan.audience}
                    </p>
                    <h3 className="heading-section mt-1.5 text-[1.35rem]">
                      {plan.name}
                    </h3>
                  </div>
                  {plan.popular ? (
                    <span className="inline-flex h-7 items-center rounded-full bg-primary px-2.5 text-[11.5px] font-medium tracking-[-0.01em] text-primary-foreground">
                      Most Popular
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-[2rem] font-medium tracking-[-0.05em]">
                    {money(amount)}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    /user{cycleSuffix(cycle)}
                  </span>
                </p>
                <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
                  {plan.blurb}
                </p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.includes ? (
                    <li className="text-[13px] font-medium tracking-[-0.01em]">
                      {plan.includes}
                    </li>
                  ) : null}
                  {plan.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2 text-[13px] leading-snug"
                    >
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chart-2"
                        strokeWidth={2}
                      />
                      {point}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={orgLocked}
                  onClick={() => {
                    if (entitlements.orgActive && !current) return;
                    setBillingPlan(plan.id);
                  }}
                  className={cn(
                    "mt-6 inline-flex h-10 w-full items-center justify-center rounded-full px-4 text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-200",
                    current
                      ? "border border-foreground/15 text-muted-foreground"
                      : orgLocked
                        ? "border border-foreground/15 text-muted-foreground"
                        : plan.popular
                          ? "bg-primary text-primary-foreground hover:bg-foreground"
                          : "border border-foreground/15 hover:bg-muted",
                  )}
                >
                  {current
                    ? "Current plan"
                    : orgLocked
                      ? "Managed by org"
                      : plan.cta}
                </button>
              </article>
            );
          })}
          </div>
        </>
      ) : null}

      <EnterpriseRequest />

      {!entitlements.isMember ? (
        <>
          <h3 className="heading-section mt-12 text-[1.15rem]">Compare features</h3>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            Access, not usage. Hosting sits at the bottom — it isn’t a plan.
          </p>

          <div className="mt-5 overflow-hidden rounded-[10px] border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_3.5rem] sm:grid-cols-[minmax(0,1fr)_5rem_5rem_5rem]">
              <div className="contents text-[13px]">
                <div className="border-b border-border bg-muted/50 px-4 py-3 font-medium">
                  Feature
                </div>
                {appPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className={cn(
                      "border-b border-border bg-muted/50 px-2 py-3 text-center font-medium sm:px-4",
                      entitlements.plan === plan.id && "text-foreground",
                    )}
                  >
                    {plan.name}
                  </div>
                ))}
              </div>
              {comparisonGroups.map((group) => (
                <div key={group.id} className="contents">
                  <div className="col-span-4 border-b border-border bg-muted/30 px-4 py-2 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                    {group.label}
                  </div>
                  {group.rows.map((row) => (
                    <div key={row.label} className="contents">
                      <div className="border-b border-border px-4 py-3">
                        {row.label}
                      </div>
                      {appPlans.map((plan) => (
                        <div
                          key={plan.id}
                          className="border-b border-border px-2 py-3 sm:px-4"
                        >
                          <Cell value={row.values[plan.id]} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <h3 className="heading-section mt-12 text-[1.15rem]">Questions</h3>
      <div className="mt-4 divide-y divide-border rounded-[10px] border border-border">
        {pricingFaqs.map((item) => (
          <details key={item.q} className="group px-5 py-4">
            <summary className="cursor-pointer list-none text-[14px] font-medium tracking-[-0.01em]">
              {item.q}
            </summary>
            <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}

function CycleToggle({
  cycle,
  onChange,
}: {
  cycle: BillingCycle;
  onChange: (id: BillingCycle) => void;
}) {
  return (
    <div className="inline-flex h-10 items-center rounded-[10px] border border-foreground/12 p-0.5">
      {(
        [
          { id: "month", label: "Monthly" },
          { id: "year", label: "Annual" },
        ] as const
      ).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "h-9 rounded-[10px] px-3 text-[12.5px] font-medium tracking-[-0.01em] transition-colors duration-200",
            cycle === item.id
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Cell({ value }: { value: CompareValue }) {
  if (value === true) {
    return (
      <Check
        className="mt-px block h-3.5 w-3.5 shrink-0 text-chart-2"
        strokeWidth={2}
      />
    );
  }
  if (value === false) {
    return (
      <Minus
        className="mt-px block h-3.5 w-3.5 shrink-0 text-muted-foreground/50"
        strokeWidth={1.6}
      />
    );
  }
  return (
    <span className="block text-[12px] leading-snug sm:text-[13px]">{value}</span>
  );
}

const ENTERPRISE_EMAIL = "enterprise@thinkrecursion.ai";

function EnterpriseRequest() {
  return (
    <article className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-border bg-card px-5 py-4">
      <div className="min-w-0">
        <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
          Enterprise
        </p>
        <h3 className="mt-1 text-[15px] font-medium tracking-[-0.02em]">
          Custom plans, SSO, residency, SLAs
        </h3>
      </div>
      <a
        href={`mailto:${ENTERPRISE_EMAIL}?subject=Enterprise%20request`}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-[13.5px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground"
      >
        <Mail className="h-3.5 w-3.5" strokeWidth={1.6} />
        Email
      </a>
    </article>
  );
}

function BillStat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[12px] text-muted-foreground">{k}</p>
      <p className="mt-1 text-[15px] font-medium tracking-[-0.02em]">{v}</p>
    </div>
  );
}
