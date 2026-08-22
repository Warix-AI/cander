"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppWindow, ImagePlus, Moon, Square, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useApp } from "@/components/app/AppProvider";
import { AccountAvatar } from "@/components/shell/AccountAvatar";
import { ConnectorsSettings } from "@/components/settings/ConnectorsSettings";
import { PlansSettings } from "@/components/settings/PlansSettings";
import {
  SettingsField,
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
  SettingsStatGrid,
  settingsInputClass,
  settingsSelectClass,
} from "@/components/settings/SettingsChrome";
import { WorkspacesSettings } from "@/components/settings/WorkspaceSettings";
import { workspaces, workspaceResources } from "@/lib/data";
import {
  memberName,
  orgMembersOf,
  orgMaxSeats,
  orgUltraSeats,
} from "@/lib/entitlements";
import { orgSeatMix, planLabel, seatMixLabel } from "@/lib/billing";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SHELL_STYLES, setShellStyle, useShellStyle } from "@/lib/shell-chrome";
import { workspaceKindOf } from "@/lib/workspace-kind";
import {
  clearProfilePhoto,
  getProfilePhotosServerSnapshot,
  getProfilePhotosSnapshot,
  profilePhotoFor,
  readProfilePhotoFile,
  setProfilePhoto,
  subscribeProfilePhotos,
} from "@/lib/profile-photos";
import { persistSignedOut, persistActor } from "@/lib/session";
import {
  activateMaxSeat,
  setMemberRole,
  setMemberSeat,
  toggleMemberWorkspace,
} from "@/lib/workspace-policy";

const roles: Role[] = ["Owner", "Admin", "Member"];

/** Full-screen account settings — tabs live in the sidebar. */
export function SettingsView() {
  const {
    settingsTab,
    setSettingsTab,
    entitlements,
    canGoBack,
    goBack,
    newChat,
  } = useApp();
  const [workspacePage, setWorkspacePage] = useState<string | null>(null);

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

  const leave = () => {
    if (canGoBack) goBack();
    else newChat();
  };

  return (
    <>
      {settingsTab === "organization" ? <OrganizationSettings /> : null}

      {settingsTab === "workspaces" ? (
        <WorkspacesSettings
          selectedId={workspacePage}
          onSelect={setWorkspacePage}
        />
      ) : null}

      {settingsTab === "connectors" ? <ConnectorsSettings /> : null}

      {settingsTab === "plans" ? <PlansSettings /> : null}

      {settingsTab === "general" ? (
        <GeneralSettings
          onLogout={() => {
            persistActor("m1");
            persistSignedOut();
            leave();
          }}
          onRestartOnboarding={() => {
            persistActor("m1");
            persistSignedOut();
          }}
        />
      ) : null}

      {settingsTab === "appearance" ? <AppearanceSettings /> : null}
    </>
  );
}

function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const shellStyle = useShellStyle();

  return (
    <SettingsPage>
      <SettingsHeader
        title="Appearance"
        subtitle="Theme and shell style for this device. Changes apply immediately."
      />

      <div className="mt-8 space-y-3">
        <SettingsGroup title="Theme">
          <SettingsRow
            label="Color mode"
            description="Light for daytime work. Dark when you prefer lower contrast."
          >
            <div className="inline-flex rounded-[10px] border border-border p-0.5">
              {(["light", "dark"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTheme(id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[12.5px] font-medium tracking-[-0.01em] transition-colors duration-200",
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
          </SettingsRow>
        </SettingsGroup>

        <SettingsSection
          title="Style"
          description="How the menu and space banners sit against the rest of the shell."
          className="mt-6"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {SHELL_STYLES.map((item) => {
              const active = shellStyle === item.id;
              const Icon = item.id === "floating" ? AppWindow : Square;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setShellStyle(item.id)}
                  className={cn(
                    "rounded-[10px] border p-4 text-left transition-colors duration-200",
                    active
                      ? "border-foreground/25 bg-card"
                      : "border-border bg-card hover:border-foreground/20 hover:bg-muted/40",
                  )}
                >
                  <StylePreview kind={item.id} active={active} />
                  <span className="mt-3 flex items-center gap-2">
                    <Icon
                      className="h-3.5 w-3.5 text-muted-foreground"
                      strokeWidth={1.6}
                    />
                    <span className="text-[13.5px] font-medium tracking-[-0.02em]">
                      {item.label}
                    </span>
                  </span>
                  <span className="mt-1 block text-[12.5px] leading-relaxed text-muted-foreground">
                    {item.description}
                  </span>
                </button>
              );
            })}
          </div>
        </SettingsSection>
      </div>
    </SettingsPage>
  );
}

function StylePreview({
  kind,
  active,
}: {
  kind: "classic" | "floating";
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "relative h-24 overflow-hidden rounded-[10px] border border-border bg-background",
        active && "border-foreground/15",
      )}
    >
      <div className="absolute inset-y-0 left-0 flex w-[18%] flex-col items-center gap-1.5 border-r border-border/80 bg-muted/40 py-2">
        <span className="h-2.5 w-2.5 rounded-[3px] bg-foreground/25" />
        <span className="h-2.5 w-2.5 rounded-[3px] bg-foreground/15" />
        <span className="h-2.5 w-2.5 rounded-[3px] bg-foreground/10" />
      </div>
      {kind === "floating" ? (
        <div className="absolute top-2 bottom-2 left-[22%] w-[28%] rounded-[8px] border border-border bg-muted/70" />
      ) : (
        <div className="absolute inset-y-0 left-[18%] w-[32%] border-r border-border bg-muted/55" />
      )}
      <div
        className={cn(
          "absolute right-2 left-[54%] bg-chart-2/35",
          kind === "floating"
            ? "top-2 h-7 rounded-[8px]"
            : "top-0 h-8 rounded-none",
        )}
      />
    </div>
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
  const orgWorkspaces = workspaces.filter(
    (item) => workspaceKindOf(item) === "business",
  );
  const maxSeats = orgMaxSeats(orgMembers);
  const ultraSeats = orgUltraSeats(orgMembers);
  const mixLabel = seatMixLabel(orgSeatMix(orgMembers)).join(" · ");
  const managedResources = workspaceResources.filter(
    (item) => item.status === "active",
  );

  return (
    <SettingsPage>
      <SettingsHeader
        title="Organization"
        subtitle="People, roles, and seats for Acme. Pending invites need a Max or Ultra seat before shared workspaces unlock."
        actions={
          <button
            type="button"
            onClick={() => setSettingsTab("plans")}
            className="inline-flex h-9 items-center rounded-full border border-foreground/15 px-3.5 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted"
          >
            View plans
          </button>
        }
      />

      <SettingsSection title="Overview" className="mt-8">
        <SettingsStatGrid
          items={[
            { label: "Legal name", value: "Acme Incorporated" },
            { label: "Domain", value: "acme.com" },
            { label: "Seat mix", value: mixLabel || "None" },
            { label: "Max seats", value: `${maxSeats}` },
            { label: "Ultra seats", value: `${ultraSeats}` },
            { label: "People", value: `${roster.length}` },
          ]}
        />
      </SettingsSection>

      {entitlements.canManageInfrastructure && managedResources.length ? (
        <SettingsSection
          title="Shared infrastructure"
          description="Ultra-managed resources this organization can use."
        >
          <div className="space-y-3">
            {managedResources.map((item) => (
              <SettingsPanel key={item.id}>
                <p className="text-[14px] font-medium tracking-[-0.02em]">
                  {item.name}
                </p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {item.kind} · {item.environment} · managed by{" "}
                  {memberName(item.ownerId, orgMembers)}
                </p>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  Authorized:{" "}
                  {item.authorizedMemberIds
                    .map((id) => memberName(id, orgMembers))
                    .join(", ") || "None"}
                </p>
              </SettingsPanel>
            ))}
          </div>
        </SettingsSection>
      ) : null}

      <SettingsSection title="Spaces">
        <SettingsGroup>
          <SettingsRow
            label="Allow Personal space"
            description="Show Personal in the sidebar for this organization."
          >
            <button
              type="button"
              role="switch"
              aria-checked={personalSpaceEnabled}
              onClick={() => setPersonalSpaceEnabled(!personalSpaceEnabled)}
              className="inline-flex h-8 shrink-0 items-center rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted"
            >
              {personalSpaceEnabled ? "On" : "Off"}
            </button>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Users"
        description="Role is organization-wide. Only Max seats can use shared workspaces."
      >
        <div className="space-y-3">
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
              <SettingsGroup key={member.id}>
                <SettingsRow
                  label={
                    member.id === actor.id
                      ? `${member.name} (You)`
                      : member.name
                  }
                  description={`${member.email} · ${planLabel(member.plan)}${pending ? " · Needs Max seat" : ""}`}
                >
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
                      className={settingsSelectClass}
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[12.5px] text-muted-foreground">
                      {member.role}
                    </span>
                  )}
                </SettingsRow>
                {!pending && entitlements.isOwner ? (
                  <div className="flex flex-wrap gap-1.5 px-4 py-3">
                    {(["max", "ultra", "pro", "free"] as const).map((plan) => (
                      <button
                        key={plan}
                        type="button"
                        onClick={() => setMemberSeat(member.id, plan)}
                        className={cn(
                          "inline-flex h-7 items-center rounded-full px-2.5 text-[11.5px] font-medium tracking-[-0.01em]",
                          member.plan === plan && member.seatStatus === "active"
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        {planLabel(plan)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {!pending ? (
                  <div className="px-4 py-3">
                    <p className="text-[12px] font-medium tracking-[-0.01em] text-muted-foreground">
                      Workspaces
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
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
                              "inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-medium tracking-[-0.01em] transition-colors duration-200",
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
                  </div>
                ) : null}
              </SettingsGroup>
            );
          })}
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}

function GeneralSettings({
  onLogout,
  onRestartOnboarding,
}: {
  onLogout: () => void;
  onRestartOnboarding: () => void;
}) {
  const [gone, setGone] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const { actor, entitlements } = useApp();
  const photos = useSyncExternalStore(
    subscribeProfilePhotos,
    getProfilePhotosSnapshot,
    getProfilePhotosServerSnapshot,
  );
  const photo = profilePhotoFor(actor.id, photos);

  return (
    <SettingsPage>
      <SettingsHeader
        title="General"
        subtitle="Account information for this login."
      />

      <div className="mt-8 space-y-3">
        <SettingsGroup title="Profile">
          <div className="flex flex-wrap items-center gap-4 px-4 py-4">
            <AccountAvatar
              memberId={actor.id}
              name={actor.name}
              initials={actor.initials}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium tracking-[-0.01em]">
                Profile photo
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                Shown on your account row and in shared workspaces.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPhotoError(null);
                    photoInput.current?.click();
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted"
                >
                  <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.6} />
                  {photo ? "Replace" : "Upload"}
                </button>
                {photo ? (
                  <button
                    type="button"
                    onClick={() => {
                      clearProfilePhoto(actor.id);
                      setPhotoError(null);
                    }}
                    className="inline-flex h-8 items-center rounded-full px-3 text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {photoError ? (
                <p className="mt-2 text-[12.5px] text-destructive">{photoError}</p>
              ) : null}
            </div>
          </div>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void readProfilePhotoFile(file)
                .then((dataUrl) => {
                  setProfilePhoto(actor.id, dataUrl);
                  setPhotoError(null);
                })
                .catch((err: unknown) => {
                  setPhotoError(
                    err instanceof Error
                      ? err.message
                      : "Could not upload image.",
                  );
                });
            }}
          />
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <SettingsField label="Full name">
              <input
                defaultValue={actor.name}
                key={`${actor.id}-name`}
                className={settingsInputClass}
              />
            </SettingsField>
            <SettingsField label="Email">
              <input
                defaultValue={actor.email}
                key={`${actor.id}-email`}
                className={settingsInputClass}
              />
            </SettingsField>
            <SettingsField label="What should Courier call you?">
              <input
                defaultValue={actor.short}
                key={`${actor.id}-short`}
                className={settingsInputClass}
              />
            </SettingsField>
            <SettingsField
              label="Instructions for Courier"
              hint={
                entitlements.hasWorkspaces
                  ? "Optional. Applied across workspaces on this account."
                  : "Optional. Applied on this account."
              }
              className="sm:col-span-2"
            >
              <textarea
                rows={3}
                placeholder="Keep replies short. Prefer Recursion brand language."
                className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13.5px] outline-none focus:border-foreground/20"
              />
            </SettingsField>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Account">
          <SettingsRow
            label="Restart onboarding"
            description="Sign out and open the full-screen welcome flow. Useful for testing."
          >
            <button
              type="button"
              onClick={onRestartOnboarding}
              className="inline-flex h-8 items-center rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted"
            >
              Start onboarding
            </button>
          </SettingsRow>
          <SettingsRow
            label="Log out"
            description="Sign out of Courier on this device."
          >
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-8 items-center rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted"
            >
              Log out
            </button>
          </SettingsRow>
          <SettingsRow
            label="Delete account"
            description="Remove this login and its local Courier data."
          >
            <button
              type="button"
              onClick={() => setGone(true)}
              className="inline-flex h-8 items-center rounded-full border border-destructive/30 px-3 text-[12.5px] font-medium tracking-[-0.01em] text-destructive hover:bg-destructive/10"
            >
              {gone ? "Deleted" : "Delete account"}
            </button>
          </SettingsRow>
        </SettingsGroup>
      </div>
    </SettingsPage>
  );
}
