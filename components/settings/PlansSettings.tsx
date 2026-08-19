"use client";

import { useState } from "react";
import { Check, Mail, Minus } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { PreviewAccount } from "@/components/settings/PreviewAccount";
import {
  billingFor,
  comparisonGroups,
  courierPlans,
  cycleAmount,
  cycleSuffix,
  money,
  planLabel,
  platformUltra,
  pricingFaqs,
  type BillingCycle,
  type CompareValue,
} from "@/lib/billing";
import { orgMembersOf, orgProSeats, orgUltraLicenses } from "@/lib/entitlements";
import { cn } from "@/lib/utils";

export function PlansSettings() {
  const {
    actor,
    entitlements,
    setBillingPlan,
    ultraLicenses,
    addOrgUltra,
    assignUltra,
    removeOrgUltra,
    hostingMode,
    orgMembers,
  } = useApp();
  const [cycle, setCycle] = useState<BillingCycle>("month");
  const orgLicenses = orgUltraLicenses(ultraLicenses);
  const roster = orgMembersOf(orgMembers);
  const proSeats = orgProSeats(orgMembers);
  const bill = billingFor(hostingMode, {
    users: entitlements.showPlansBilling ? proSeats : 1,
    apiEnabled: orgLicenses.length > 0,
    ultraLicenses: orgLicenses.length,
    plan: entitlements.showPlansBilling ? "pro" : entitlements.plan,
  });
  const seatTotal = cycleAmount(bill.courier, cycle);
  const unlockTotal = cycleAmount(bill.api, cycle);
  const grand = seatTotal + unlockTotal;
  const assignable = roster.filter((item) => item.plan !== "free");

  return (
    <div className="pb-10">
      <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
        Plans
      </p>
      <h2
        id="settings-title"
        className="heading-display mt-2 max-w-xl text-[1.85rem]"
      >
        Courier for people. Platform for what they build.
      </h2>
      <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-muted-foreground">
        Pro seats power the organization. Plus and Free can be invited, but
        shared workspaces wait on a Pro seat. Ultra is assigned to a person.
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
            Acme is a Pro organization. A Pro seat is required to use shared
            workspaces. Ask an admin to add one, or stay on your personal{" "}
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
            You are on Pro, billed to Acme. Billing and Ultra licenses are
            managed by the Owner.
            {entitlements.ultraAssigned
              ? " Ultra is assigned to you — full Platform."
              : " You have Limited Platform unless Ultra is assigned to you."}
          </p>
        </div>
      ) : null}

      {entitlements.showPlansBilling ? (
        <div className="mt-6 rounded-[10px] border border-border bg-card p-5">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            This organization
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <BillStat
              k={`${bill.users} Pro seats`}
              v={`${money(seatTotal)}${bill.seat ? cycleSuffix(cycle) : ""}`}
            />
            <BillStat
              k={`${orgLicenses.length} Ultra licenses`}
              v={
                orgLicenses.length
                  ? `${money(unlockTotal)}${cycleSuffix(cycle)}`
                  : "None"
              }
            />
            <BillStat k="Total" v={`${money(grand)}${cycleSuffix(cycle)}`} />
          </div>
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            {entitlements.canBuyUltra
              ? "Seats and Ultra are billed separately. Each Ultra must be assigned to a person."
              : "You can assign unused Ultra licenses. Only the Owner can buy or cancel them."}
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
          {entitlements.ultraAssigned ? " · Ultra" : ""}
          {entitlements.showInviteWall ? " · pending invite" : ""}.
        </p>
        <CycleToggle cycle={cycle} onChange={setCycle} />
      </div>

      {!entitlements.isMember ? (
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {courierPlans.map((plan) => {
            const current = entitlements.plan === plan.id;
            const amount = cycleAmount(plan.price, cycle);
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
                    <span className="inline-flex h-7 items-center rounded-full bg-primary px-2.5 text-[11px] font-medium tracking-[-0.01em] text-primary-foreground">
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
                  disabled={entitlements.orgActive && !current}
                  onClick={() => {
                    if (entitlements.orgActive) return;
                    setBillingPlan(plan.id);
                  }}
                  className={cn(
                    "mt-6 inline-flex h-10 w-full items-center justify-center rounded-full px-4 text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-200",
                    current
                      ? "border border-foreground/15 text-muted-foreground"
                      : entitlements.orgActive
                        ? "border border-foreground/15 text-muted-foreground"
                        : plan.popular
                          ? "bg-primary text-primary-foreground hover:bg-foreground"
                          : "border border-foreground/15 hover:bg-muted",
                  )}
                >
                  {current
                    ? "Current plan"
                    : entitlements.orgActive
                      ? "Org seats are Pro"
                      : plan.cta}
                </button>
              </article>
            );
          })}
        </div>
      ) : null}

      <EnterpriseRequest />

      <article className="relative mt-6 overflow-hidden rounded-[10px] text-white">
        <div className="hero-gradient absolute inset-0" />
        <div className="grain-layer" />
        <div className="relative z-10 grid gap-8 p-6 md:grid-cols-[1fr_auto] md:p-8">
          <div>
            <p className="font-mono text-[11px] tracking-[0.08em] text-white/65 uppercase">
              {platformUltra.audience}
            </p>
            <h3 className="heading-section mt-2 text-[1.55rem] text-white">
              {platformUltra.name}
            </h3>
            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-white/75">
              {platformUltra.blurb}
            </p>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {platformUltra.points.map((point) => (
                <li
                  key={point}
                  className="flex gap-2 text-[13px] leading-snug text-white/85"
                >
                  <Check
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    strokeWidth={2}
                  />
                  {point}
                </li>
              ))}
            </ul>
            {entitlements.canAssignUltra ? (
              <div className="mt-5 space-y-2">
                {orgLicenses.map((license, index) => {
                  const holder = roster.find(
                    (item) => item.id === license.userId,
                  );
                  return (
                    <div
                      key={license.id}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <p className="text-[12.5px] text-white/70">
                        License {index + 1}
                      </p>
                      <select
                        value={license.userId ?? ""}
                        onChange={(event) =>
                          assignUltra(license.id, event.target.value || null)
                        }
                        className="h-8 rounded-[10px] border border-white/25 bg-white/10 px-2 text-[12.5px] text-white outline-none"
                      >
                        <option value="">Unassigned</option>
                        {assignable.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <span className="text-[12px] text-white/55">
                        {holder
                          ? `${holder.name} · full Platform`
                          : "Does nothing until assigned"}
                      </span>
                      {entitlements.canBuyUltra ? (
                        <button
                          type="button"
                          onClick={() => removeOrgUltra(license.id)}
                          className="text-[12px] text-white/70 hover:text-white"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col justify-between rounded-[10px] bg-white/10 p-5 md:min-w-[16rem]">
            <div>
              <p className="text-[2rem] font-medium tracking-[-0.05em]">
                {money(cycleAmount(platformUltra.price, cycle))}
              </p>
              <p className="mt-1 text-[13px] text-white/70">
                /person{cycleSuffix(cycle)}
              </p>
              <p className="mt-4 text-[12.5px] leading-relaxed text-white/65">
                {entitlements.ultraAssigned
                  ? "Ultra is assigned to you. Unlimited Platform on Local or On-device."
                  : entitlements.plan === "free"
                    ? "Ultra is a Plus or Pro add-on, assigned to one person."
                    : "Unassigned licenses do nothing. Assign one to unlock full Platform."}
              </p>
            </div>
            {entitlements.canBuyUltra ? (
              <button
                type="button"
                onClick={() => addOrgUltra()}
                className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-white px-4 text-[13.5px] font-medium tracking-[-0.01em] text-neutral-950 hover:bg-white/90"
              >
                Add Ultra license
              </button>
            ) : (
              <p className="mt-6 text-[12.5px] text-white/65">
                {entitlements.ultraAssigned
                  ? "This license is assigned to you."
                  : entitlements.orgActive
                    ? "Ask the Owner to buy or assign Ultra."
                    : entitlements.plan === "plus"
                      ? "Preview Plus + Ultra to see full Platform on a Plus seat."
                      : "Starts on Plus."}
              </p>
            )}
          </div>
        </div>
      </article>

      {!entitlements.isMember ? (
        <>
          <h3 className="heading-section mt-12 text-[1.15rem]">Compare features</h3>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            Access, not usage. Hosting sits at the bottom — it isn’t a plan.
          </p>

          <div className="mt-5 overflow-hidden rounded-[10px] border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_4.75rem_4.75rem_4.75rem] sm:grid-cols-[minmax(0,1fr)_6rem_6rem_6rem]">
              <div className="contents text-[13px]">
                <div className="border-b border-border bg-muted/50 px-4 py-3 font-medium">
                  Feature
                </div>
                {courierPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className={cn(
                      "border-b border-border bg-muted/50 px-4 py-3 font-medium",
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
                      {courierPlans.map((plan) => (
                        <div
                          key={plan.id}
                          className="border-b border-border px-4 py-3"
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
    <span className="block text-[13px] leading-none">{value}</span>
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
