"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Moon, Search, Sun, X } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useApp } from "@/components/app/AppProvider";
import { WorkspacesSettings } from "@/components/settings/WorkspaceSettings";
import { Modal } from "@/components/ui/Modal";
import { account, currentUser, members } from "@/lib/data";
import { billingFor, hostingLabel, money } from "@/lib/billing";
import type { SettingsTab } from "@/lib/types";
import { cn } from "@/lib/utils";

const groups: { label: string; items: { id: SettingsTab; label: string }[] }[] =
  [
    {
      label: "Account",
      items: [
        { id: "account", label: "General" },
        { id: "users", label: "Users" },
        { id: "access", label: "Access" },
      ],
    },
    {
      label: "Preferences",
      items: [{ id: "appearance", label: "Appearance" }],
    },
  ];

export function SettingsModal() {
  const { overlay, closeOverlay, settingsTab, setSettingsTab, hostingMode, apiEnabled } =
    useApp();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [workspacePage, setWorkspacePage] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          item.label.toLowerCase().includes(needle),
        ),
      }))
      .filter((group) => group.items.length);
  }, [query]);

  return (
    <Modal
      open={overlay === "settings"}
      onClose={closeOverlay}
      labelledBy="settings-title"
      className="flex h-[min(52rem,calc(100vh-3rem))] w-[min(56rem,calc(100vw-2rem))]"
    >
      <nav className="flex w-[13.5rem] shrink-0 flex-col border-r border-border bg-muted/40 p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.6}
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-9 w-full rounded-lg border border-border bg-background pr-3 pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus:border-foreground/20"
          />
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {visible.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="px-2 pb-1 text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase">
                {group.label}
              </p>
              {group.items.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSettingsTab(tab.id)}
                  className={cn(
                    "flex w-full rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors duration-200",
                    settingsTab === tab.id
                      ? "bg-muted font-medium"
                      : "hover:bg-muted",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-auto space-y-0.5 pt-2">
          <button
            type="button"
            onClick={() => setSettingsTab("organization")}
            className={cn(
              "flex w-full rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors duration-200 hover:bg-muted",
              settingsTab === "organization" && "bg-muted font-medium",
            )}
          >
            Organization
          </button>
          <button
            type="button"
            onClick={() => {
              setWorkspacePage(null);
              setSettingsTab("workspaces");
            }}
            className={cn(
              "flex w-full rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors duration-200 hover:bg-muted",
              settingsTab === "workspaces" && "bg-muted font-medium",
            )}
          >
            Workspaces
          </button>
        </div>
      </nav>

      <div className="relative min-w-0 flex-1 overflow-y-auto px-8 py-7">
        <button
          type="button"
          aria-label="Close settings"
          onClick={closeOverlay}
          className="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>

        {settingsTab === "account" ? (
          <>
            <h2
              id="settings-title"
              className="text-[18px] font-semibold tracking-[-0.03em]"
            >
              Profile
            </h2>
            <div className="mt-6 max-w-xl space-y-4">
              <Field label="Full name">
                <input
                  defaultValue={currentUser.name}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-[13.5px] outline-none focus:border-foreground/20"
                />
              </Field>
              <Field label="What should Courier call you?">
                <input
                  defaultValue={currentUser.short}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-[13.5px] outline-none focus:border-foreground/20"
                />
              </Field>
              <Field
                label="Instructions for Courier"
                hint="Optional. Applied across workspaces on this account."
              >
                <textarea
                  rows={4}
                  placeholder="Keep replies short. Prefer Recursion brand language."
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[13.5px] outline-none focus:border-foreground/20"
                />
              </Field>
              <div className="rounded-lg border border-border p-4">
                <Line k="Organization" v={account.name} />
                <Line k="Seats" v={`${account.seats}`} />
                <Line k="Owner" v="Jackson Oaks" />
              </div>
            </div>
          </>
        ) : null}

        {settingsTab === "users" ? (
          <>
            <h2 className="text-[18px] font-semibold tracking-[-0.03em]">
              Users
            </h2>
            <div className="mt-6 max-w-2xl">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-baseline justify-between gap-3 border-b border-border py-3"
                >
                  <div>
                    <p className="text-[14px]">{member.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {member.role}
                  </p>
                </div>
              ))}
              <p className="mt-4 text-[13px] text-muted-foreground">
                {account.seats} Courier users · billed per seat on the
                organization.
              </p>
            </div>
          </>
        ) : null}

        {settingsTab === "workspaces" ? (
          <WorkspacesSettings
            selectedId={workspacePage}
            onSelect={setWorkspacePage}
          />
        ) : null}

        {settingsTab === "organization" ? (
          <OrganizationBilling />
        ) : null}

        {settingsTab === "access" ? (
          <>
            <h2 className="text-[18px] font-semibold tracking-[-0.03em]">
              Access
            </h2>
            <div className="mt-6 max-w-lg rounded-lg border border-border p-5">
              <Line k="Courier" v="Entitled · billed per user" />
              <Line
                k="Courier Platform APIs"
                v={apiEnabled ? `${hostingLabel(hostingMode)} license` : "Not enabled"}
              />
            </div>
          </>
        ) : null}

        {settingsTab === "appearance" ? (
          <>
            <h2 className="text-[18px] font-semibold tracking-[-0.03em]">
              Preferences
            </h2>
            <div className="mt-6 max-w-lg">
              <p className="mb-2 text-[13px] text-muted-foreground">Appearance</p>
              <div className="inline-flex rounded-lg border border-border p-0.5">
                {(["light", "dark"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors duration-200",
                      theme === id
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {id === "light" ? (
                      <Sun className="h-3.5 w-3.5" strokeWidth={1.6} />
                    ) : (
                      <Moon className="h-3.5 w-3.5" strokeWidth={1.6} />
                    )}
                    {id === "light" ? "Light" : "Dark"}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {hint ? (
        <span className="mt-0.5 block text-[12px] text-muted-foreground/80">
          {hint}
        </span>
      ) : null}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-[13px] text-muted-foreground">{k}</span>
      <span className="text-[13px]">{v}</span>
    </div>
  );
}

function OrganizationBilling() {
  const { hostingMode, apiEnabled, setApiEnabled } = useApp();
  const bill = billingFor(hostingMode, { apiEnabled });

  return (
    <>
      <h2 className="text-[18px] font-medium tracking-[-0.02em]">
        Organization
      </h2>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
        Identity and billing. One organization, one hosting model. Courier is
        per user. APIs are a monthly license.
      </p>
      <div className="mt-8 max-w-2xl rounded-[10px] border border-border p-5">
        <Line k="Legal name" v="Acme Incorporated" />
        <Line k="Domain" v="acme.com" />
        <Line k="Default workspace" v="Marketing" />
      </div>

      <h3 className="mt-10 text-[15px] font-medium">Billing</h3>
      <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
        What Acme has on {hostingLabel(hostingMode)}, and what it pays this
        month.
      </p>

      <div className="mt-5 max-w-2xl rounded-[10px] border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="heading-display text-[1.55rem]">
              {hostingLabel(hostingMode)}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Hosting model sets both seat and API license prices.
            </p>
          </div>
          <p className="text-[1.65rem] font-medium tracking-[-0.04em]">
            {money(bill.total)}
            <span className="ml-1 text-[13px] font-normal text-muted-foreground">
              /month
            </span>
          </p>
        </div>

        <section className="mt-8 border-t border-border pt-6">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            Courier
          </p>
          <Line k="Active users" v={`${bill.users}`} />
          <Line k="Price per user" v={`${money(bill.seat)}/month`} />
          <div className="mt-2 flex items-baseline justify-between gap-4 pt-2">
            <span className="text-[13.5px]">Monthly Courier subtotal</span>
            <span className="text-[15px] font-medium tracking-[-0.02em]">
              {money(bill.courier)}/month
            </span>
          </div>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            {bill.users} users × {money(bill.seat)} = {money(bill.courier)}
            /month
          </p>
        </section>

        <section
          className={cn(
            "mt-6 border-t border-border pt-6",
            !bill.apiEnabled && "opacity-55",
          )}
        >
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            Courier Platform / APIs
          </p>
          <Line
            k="API access"
            v={bill.apiEnabled ? "Enabled" : "Not enabled"}
          />
          <Line k="API license" v={`${money(bill.license)}/month`} />
          <Line
            k="Licensed deployments"
            v={bill.apiEnabled ? bill.deployments : "—"}
          />
          <div className="py-2">
            <p className="text-[13px] text-muted-foreground">APIs in use</p>
            <p className="mt-1 font-mono text-[12.5px]">
              {bill.apiEnabled ? bill.apis.join(" · ") : "None"}
            </p>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-4 pt-2">
            <span className="text-[13.5px]">Monthly API subtotal</span>
            <span className="text-[15px] font-medium tracking-[-0.02em]">
              {money(bill.api)}/month
            </span>
          </div>
          <button
            type="button"
            onClick={() => setApiEnabled(!bill.apiEnabled)}
            className="mt-4 inline-flex h-10 items-center rounded-full border border-foreground/15 px-4 text-[13.5px] font-medium tracking-[-0.01em] hover:bg-muted"
          >
            {bill.apiEnabled ? "Disable API access" : "Enable API access"}
          </button>
        </section>

        <div className="mt-8 flex items-baseline justify-between gap-4 border-t border-border pt-5">
          <span className="text-[14px] font-medium">Total</span>
          <span className="text-[1.45rem] font-medium tracking-[-0.04em]">
            {money(bill.total)}/month
          </span>
        </div>
      </div>
    </>
  );
}
