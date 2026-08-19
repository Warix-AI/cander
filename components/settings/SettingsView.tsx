"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Moon, Search, Sun, X } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useApp } from "@/components/app/AppProvider";
import { PlansSettings } from "@/components/settings/PlansSettings";
import { WorkspacesSettings } from "@/components/settings/WorkspaceSettings";
import { Modal } from "@/components/ui/Modal";
import { workspaces, workspaceResources } from "@/lib/data";
import {
  memberName,
  orgMembersOf,
  orgMaxSeats,
  orgUltraSeats,
} from "@/lib/entitlements";
import { orgSeatMix, planLabel, seatMixLabel } from "@/lib/billing";
import type { Role, SettingsTab } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  activateMaxSeat,
  setMemberRole,
  setMemberSeat,
  toggleMemberWorkspace,
} from "@/lib/workspace-policy";

const tabs: { id: SettingsTab; label: string }[] = [
  { id: "organization", label: "Organization" },
  { id: "workspaces", label: "Workspaces" },
  { id: "plans", label: "Plans" },
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
];

const roles: Role[] = ["Owner", "Admin", "Member"];

export function SettingsModal() {
  const {
    overlay,
    closeOverlay,
    settingsTab,
    setSettingsTab,
    entitlements,
  } = useApp();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [workspacePage, setWorkspacePage] = useState<string | null>(null);

  const visible = useMemo(() => {
    const list = tabs.filter((tab) => {
      if (tab.id === "organization") return entitlements.showOrgSettings;
      if (tab.id === "workspaces") return entitlements.showWorkspacesAdmin;
      return true;
    });
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((tab) => tab.label.toLowerCase().includes(needle));
  }, [query, entitlements.showOrgSettings, entitlements.showWorkspacesAdmin]);

  useEffect(() => {
    if (settingsTab === "workspaces" && !entitlements.showWorkspacesAdmin) {
      setSettingsTab("plans");
    }
    if (settingsTab === "organization" && !entitlements.showOrgSettings) {
      setSettingsTab("plans");
    }
  }, [
    settingsTab,
    entitlements.showWorkspacesAdmin,
    entitlements.showOrgSettings,
    setSettingsTab,
  ]);

  return (
    <Modal
      open={overlay === "settings"}
      onClose={closeOverlay}
      labelledBy="settings-title"
      className={cn(
        "flex h-[min(52rem,calc(100vh-3rem))]",
        settingsTab === "plans"
          ? "w-[min(76rem,calc(100vw-2rem))]"
          : "w-[min(56rem,calc(100vw-2rem))]",
      )}
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
            className="h-9 w-full rounded-[10px] border border-border bg-background pr-3 pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus:border-foreground/20"
          />
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {visible.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === "workspaces") setWorkspacePage(null);
                setSettingsTab(tab.id);
              }}
              className={cn(
                "flex w-full rounded-[10px] px-2.5 py-2 text-left text-[13.5px] transition-colors duration-200",
                settingsTab === tab.id
                  ? "bg-muted font-medium"
                  : "hover:bg-muted",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="relative min-w-0 flex-1 overflow-y-auto px-8 py-7">
        <button
          type="button"
          aria-label="Close settings"
          onClick={closeOverlay}
          className="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>

        {settingsTab === "organization" ? <OrganizationSettings /> : null}

        {settingsTab === "workspaces" ? (
          <WorkspacesSettings
            selectedId={workspacePage}
            onSelect={setWorkspacePage}
          />
        ) : null}

        {settingsTab === "plans" ? <PlansSettings /> : null}

        {settingsTab === "general" ? (
          <GeneralSettings onLogout={closeOverlay} />
        ) : null}

        {settingsTab === "appearance" ? (
          <>
            <h2
              id="settings-title"
              className="text-[18px] font-semibold tracking-[-0.03em]"
            >
              Appearance
            </h2>
            <div className="mt-6 max-w-lg">
              <p className="mb-2 text-[13px] text-muted-foreground">Theme</p>
              <div className="inline-flex rounded-[10px] border border-border p-0.5">
                {(["light", "dark"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13px] transition-colors duration-200",
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

function OrganizationSettings() {
  const {
    orgMembers,
    personalSpaceEnabled,
    setPersonalSpaceEnabled,
    setSettingsTab,
    actor,
    entitlements,
  } = useApp();
  const roster = orgMembersOf(orgMembers);
  const orgWorkspaces = workspaces.filter((item) => !item.personal);
  const maxSeats = orgMaxSeats(orgMembers);
  const ultraSeats = orgUltraSeats(orgMembers);
  const mixLabel = seatMixLabel(orgSeatMix(orgMembers)).join(" · ");
  const managedResources = workspaceResources.filter(
    (item) => item.status === "active",
  );

  return (
    <>
      <h2
        id="settings-title"
        className="text-[18px] font-medium tracking-[-0.02em]"
      >
        Organization
      </h2>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
        People and roles live here. Assign each person to workspaces and a plan
        seat. Pending invites need a Max or Ultra seat before shared workspaces
        unlock.
      </p>

      <div className="mt-6 max-w-2xl rounded-[10px] border border-border p-5">
        <Line k="Legal name" v="Acme Incorporated" />
        <Line k="Domain" v="acme.com" />
        <Line k="Seat mix" v={mixLabel || "None"} />
        <Line k="Max seats" v={`${maxSeats}`} />
        <Line k="Ultra seats" v={`${ultraSeats}`} />
      </div>
      <button
        type="button"
        onClick={() => setSettingsTab("plans")}
        className="mt-3 inline-flex h-10 items-center rounded-full border border-foreground/15 px-4 text-[13.5px] font-medium tracking-[-0.01em] hover:bg-muted"
      >
        View plans
      </button>

      {entitlements.canManageInfrastructure && managedResources.length ? (
        <>
          <h3 className="mt-10 text-[15px] font-medium">Shared infrastructure</h3>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Ultra-managed resources this organization can use. Owners assign who
            may consume each resource.
          </p>
          <div className="mt-4 max-w-2xl space-y-3">
            {managedResources.map((item) => (
              <div
                key={item.id}
                className="rounded-[10px] border border-border p-4"
              >
                <p className="text-[14px] font-medium tracking-[-0.01em]">
                  {item.name}
                </p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {item.kind} · {item.environment} · managed by{" "}
                  {memberName(item.ownerId, orgMembers)}
                </p>
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Authorized:{" "}
                  {item.authorizedMemberIds
                    .map((id) => memberName(id, orgMembers))
                    .join(", ") || "None"}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <h3 className="mt-10 text-[15px] font-medium">Spaces</h3>
      <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
        Personal is on every plan. This organization can hide it for the team.
      </p>
      <div className="mt-4 max-w-2xl rounded-[10px] border border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13.5px]">Allow Personal space</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
              Show Personal in the sidebar for this organization.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={personalSpaceEnabled}
            onClick={() => setPersonalSpaceEnabled(!personalSpaceEnabled)}
            className="inline-flex h-8 items-center rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted"
          >
            {personalSpaceEnabled ? "On" : "Off"}
          </button>
        </div>
      </div>

      <h3 className="mt-10 text-[15px] font-medium">Users</h3>
      <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
        Role is organization-wide. Only Max seats can use shared workspaces.
      </p>
      <div className="mt-4 max-w-2xl space-y-3">
        {roster.map((member) => {
          const pending = member.seatStatus === "pending";
          const roleOptions: Role[] = entitlements.isOwner
            ? roles
            : roles.filter((role) => role !== "Owner");
          const canEditRole =
            entitlements.canManageMembers &&
            (entitlements.isOwner || member.role !== "Owner") &&
            !pending;
          return (
            <div
              key={member.id}
              className="rounded-[10px] border border-border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] tracking-[-0.01em]">{member.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {member.email}
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {planLabel(member.plan)}
                    {pending ? " · Needs Max seat" : ""}
                    {member.id === actor.id ? " · You" : ""}
                  </p>
                </div>
                {pending ? (
                  <button
                    type="button"
                    onClick={() => activateMaxSeat(member.id)}
                    className="inline-flex h-8 items-center rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted"
                  >
                    Add Max seat
                  </button>
                ) : canEditRole ? (
                  <select
                    value={member.role}
                    onChange={(event) =>
                      setMemberRole(
                        member.id,
                        event.target.value as Role,
                        actor.id,
                      )
                    }
                    className="h-8 rounded-[10px] border border-border bg-background px-2 text-[12.5px] outline-none focus:border-foreground/20"
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[12.5px] text-muted-foreground">
                    {member.role}
                  </p>
                )}
              </div>
              {!pending && entitlements.isOwner ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(["max", "ultra", "pro", "free"] as const).map((plan) => (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setMemberSeat(member.id, plan)}
                      className={cn(
                        "inline-flex h-7 items-center rounded-full px-2.5 text-[11.5px] font-medium tracking-[-0.01em]",
                        member.plan === plan && member.seatStatus === "active"
                          ? "bg-muted"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {planLabel(plan)}
                    </button>
                  ))}
                </div>
              ) : null}
              {!pending ? (
                <>
                  <p className="mt-3 text-[12px] text-muted-foreground">
                    Workspaces
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {orgWorkspaces.map((workspace) => {
                      const on = member.workspaceIds.includes(workspace.id);
                      return (
                        <button
                          key={workspace.id}
                          type="button"
                          onClick={() =>
                            toggleMemberWorkspace(member.id, workspace.id)
                          }
                          className={cn(
                            "inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium tracking-[-0.01em] transition-colors duration-200",
                            on
                              ? "bg-primary text-primary-foreground"
                              : "border border-foreground/15 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {workspace.name}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function GeneralSettings({ onLogout }: { onLogout: () => void }) {
  const [gone, setGone] = useState(false);
  const { actor, entitlements } = useApp();

  return (
    <>
      <h2
        id="settings-title"
        className="text-[18px] font-semibold tracking-[-0.03em]"
      >
        General
      </h2>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
        Account information for this login.
      </p>
      <div className="mt-6 max-w-xl space-y-4">
        <Field label="Full name">
          <input
            defaultValue={actor.name}
            key={`${actor.id}-name`}
            className="h-10 w-full rounded-[10px] border border-border bg-card px-3 text-[13.5px] outline-none focus:border-foreground/20"
          />
        </Field>
        <Field label="Email">
          <input
            defaultValue={actor.email}
            key={`${actor.id}-email`}
            className="h-10 w-full rounded-[10px] border border-border bg-card px-3 text-[13.5px] outline-none focus:border-foreground/20"
          />
        </Field>
        <Field label="What should Courier call you?">
          <input
            defaultValue={actor.short}
            key={`${actor.id}-short`}
            className="h-10 w-full rounded-[10px] border border-border bg-card px-3 text-[13.5px] outline-none focus:border-foreground/20"
          />
        </Field>
        <Field
          label="Instructions for Courier"
          hint={
            entitlements.hasWorkspaces
              ? "Optional. Applied across workspaces on this account."
              : "Optional. Applied on this account."
          }
        >
          <textarea
            rows={4}
            placeholder="Keep replies short. Prefer Recursion brand language."
            className="w-full rounded-[10px] border border-border bg-card px-3 py-2 text-[13.5px] outline-none focus:border-foreground/20"
          />
        </Field>
      </div>

      <div className="mt-10 max-w-xl space-y-3 border-t border-border pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[14px]">Log out</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Sign out of Courier on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-10 items-center rounded-full border border-foreground/15 px-4 text-[13.5px] font-medium tracking-[-0.01em] hover:bg-muted"
          >
            Log out
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div>
            <p className="text-[14px]">Delete account</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Remove this login and its local Courier data.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGone(true)}
            className="inline-flex h-10 items-center rounded-full border border-destructive/30 px-4 text-[13.5px] font-medium tracking-[-0.01em] text-destructive hover:bg-destructive/10"
          >
            {gone ? "Deleted" : "Delete account"}
          </button>
        </div>
      </div>
    </>
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
