"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Building2,
  ChevronRight,
  CreditCard,
  ImagePlus,
  LayoutGrid,
  Palette,
  UserRound,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { AccountAvatar } from "@/components/shell/AccountAvatar";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { PlansSettings } from "@/components/settings/PlansSettings";
import { DashBtn } from "@/components/spaces/ItemSet";
import {
  SettingsField,
  SettingsFootnote,
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
  SettingsStatGrid,
  SettingsSwitch,
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
import {
  addUltraLicense,
  getUltraLicensesServerSnapshot,
  getUltraLicensesSnapshot,
  machineUltraSeats,
  removeUltraLicense,
  subscribeUltraLicenses,
} from "@/lib/ultra-licenses";
import type { Role, SettingsTab } from "@/lib/types";
import { cn } from "@/lib/utils";
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
import { visibleSettingsTabs } from "@/lib/settings-nav";
import { useMobileShell } from "@/lib/use-media-query";
import {
  activateMaxSeat,
  setMemberRole,
  setMemberSeat,
  toggleMemberWorkspace,
} from "@/lib/workspace-policy";

const roles: Role[] = ["Owner", "Admin", "Member"];

const settingsIcons: Record<SettingsTab, typeof Building2> = {
  organization: Building2,
  workspaces: LayoutGrid,
  plans: CreditCard,
  general: UserRound,
  appearance: Palette,
};

/** Full-screen account settings — hub on mobile, tabs in sidebar on desktop. */
export function SettingsView() {
  const {
    settingsTab,
    setSettingsTab,
    settingsMobileHub,
    setSettingsMobileHub,
    settingsWorkspaceId,
    setSettingsWorkspaceId,
    entitlements,
    canGoBack,
    goBack,
    newChat,
  } = useApp();
  const mobile = useMobileShell();
  const settingsNav = visibleSettingsTabs(entitlements);

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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {mobile && settingsMobileHub ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-4 pb-5 pt-2 lg:hidden">
          <SettingsGroup dividerInset="icon">
              {settingsNav.map((tab) => {
                const Icon = settingsIcons[tab.id];
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setSettingsTab(tab.id);
                      setSettingsMobileHub(false);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-muted/50"
                  >
                    <Icon
                      className="h-5 w-5 shrink-0 text-muted-foreground"
                      strokeWidth={1.9}
                    />
                    <span className="min-w-0 flex-1 text-[15px] font-medium tracking-[-0.01em]">
                      {tab.label}
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground/70"
                      strokeWidth={1.8}
                    />
                  </button>
                );
              })}
          </SettingsGroup>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {settingsTab === "organization" ? <OrganizationSettings /> : null}

          {settingsTab === "workspaces" ? (
            <WorkspacesSettings
              selectedId={settingsWorkspaceId}
              onSelect={setSettingsWorkspaceId}
            />
          ) : null}

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
        </div>
      )}
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
  const mobile = useMobileShell();
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
  const ultraLicenses = useSyncExternalStore(
    subscribeUltraLicenses,
    getUltraLicensesSnapshot,
    getUltraLicensesServerSnapshot,
  );
  const machineSeats = machineUltraSeats(ultraLicenses);

  return (
    <SettingsPage>
      <SettingsHeader title="Organization" />

      <SettingsSection title="Overview" className="mt-2 lg:mt-8">
        <SettingsStatGrid
          items={[
            { label: "Legal name", value: "Acme Incorporated" },
            { label: "Domain", value: "acme.com" },
            { label: "Seat mix", value: mixLabel || "None" },
            { label: "Max seats", value: `${maxSeats}` },
            { label: "Ultra seats", value: `${ultraSeats}` },
            {
              label: "Machine Ultra",
              value: `${machineSeats.length}`,
            },
            { label: "People", value: `${roster.length}` },
          ]}
        />
      </SettingsSection>

      {entitlements.canManageInfrastructure ? (
        <SettingsSection
          title="Ultra machine seats"
          description="Each Ultra seat licenses one production machine. Machine-only seats don’t need a separate login — you manage them here."
        >
          <div className="space-y-3">
            {machineSeats.map((seat) => (
              <SettingsGroup key={seat.id}>
                <SettingsRow
                  label={seat.label ?? "Machine seat"}
                  description="Machine-only · no user attached"
                >
                  <button
                    type="button"
                    onClick={() => removeUltraLicense(seat.id)}
                    className="inline-flex h-8 items-center rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted"
                  >
                    Remove
                  </button>
                </SettingsRow>
              </SettingsGroup>
            ))}
            {!machineSeats.length ? (
              <p className="text-[13px] text-muted-foreground">
                No machine-only Ultra seats yet.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() =>
                addUltraLicense({
                  kind: "machine",
                  scope: "org",
                  label: `Machine ${machineSeats.length + 1}`,
                })
              }
              className="inline-flex h-9 items-center rounded-full border border-foreground/15 px-3.5 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted"
            >
              Add machine Ultra seat
            </button>
          </div>
        </SettingsSection>
      ) : null}

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
            description={mobile ? undefined : "Show Personal in the sidebar for this organization."}
          >
            {mobile ? (
              <SettingsSwitch
                label="Allow Personal space"
                checked={personalSpaceEnabled}
                onChange={setPersonalSpaceEnabled}
              />
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={personalSpaceEnabled}
                onClick={() => setPersonalSpaceEnabled(!personalSpaceEnabled)}
                className="inline-flex h-8 shrink-0 items-center rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted"
              >
                {personalSpaceEnabled ? "On" : "Off"}
              </button>
            )}
          </SettingsRow>
        </SettingsGroup>
        {mobile ? (
          <SettingsFootnote>
            Show Personal in the sidebar for this organization.
          </SettingsFootnote>
        ) : null}
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
  const mobile = useMobileShell();
  const { actor, entitlements } = useApp();
  const photos = useSyncExternalStore(
    subscribeProfilePhotos,
    getProfilePhotosSnapshot,
    getProfilePhotosServerSnapshot,
  );
  const photo = profilePhotoFor(actor.id, photos);

  return (
    <SettingsPage>
      <SettingsHeader title="General" />

      {!entitlements.showOrgSettings ? (
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          Organization and Workspaces admin tabs are for owners and admins.
        </p>
      ) : null}

      <div className={cn(!entitlements.showOrgSettings ? "mt-4" : "mt-2", mobile ? "space-y-6" : "space-y-3")}>
        {mobile ? (
        <SettingsSection title="Profile">
        <SettingsGroup>
          <div className={cn("flex flex-wrap items-center gap-4 px-4", mobile ? "py-3.5" : "py-4")}>
            <AccountAvatar
              memberId={actor.id}
              name={actor.name}
              initials={actor.initials}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium tracking-[-0.01em]", mobile ? "text-[15px]" : "text-[13.5px]")}>
                Profile photo
              </p>
              {!mobile ? (
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                Shown on your account row and in shared workspaces.
              </p>
              ) : null}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPhotoError(null);
                    photoInput.current?.click();
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted"
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
            <SettingsField label="What should we call you?">
              <input
                defaultValue={actor.short}
                key={`${actor.id}-short`}
                className={settingsInputClass}
              />
            </SettingsField>
            <SettingsField
              label="Custom instructions"
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
          <SettingsFootnote>
            Shown on your account row and in shared workspaces.
          </SettingsFootnote>
        </SettingsSection>
        ) : (
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
            <SettingsField label="What should we call you?">
              <input
                defaultValue={actor.short}
                key={`${actor.id}-short`}
                className={settingsInputClass}
              />
            </SettingsField>
            <SettingsField
              label="Custom instructions"
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
        )}

        {mobile ? (
        <SettingsSection title="Account">
        <SettingsGroup>
          <SettingsRow
            label="Restart onboarding"
            description="Prototype — sign out and open the full-screen welcome flow."
          >
            <DashBtn onClick={onRestartOnboarding}>Start onboarding</DashBtn>
          </SettingsRow>
          <SettingsRow
            label="Log out"
            description="Sign out on this device."
          >
            <DashBtn onClick={onLogout}>Log out</DashBtn>
          </SettingsRow>
          <SettingsRow
            label="Delete account"
            description="Prototype only — toggles a local deleted state; nothing is removed from a server."
          >
            <button
              type="button"
              onClick={() => setGone(true)}
              className="inline-flex h-10 items-center rounded-[10px] border border-destructive/30 px-4 text-[13.5px] font-medium tracking-[-0.01em] text-destructive hover:bg-destructive/10"
            >
              {gone ? "Deleted" : "Delete account"}
            </button>
          </SettingsRow>
        </SettingsGroup>
        </SettingsSection>
        ) : (
        <SettingsGroup title="Account">
          <SettingsRow
            label="Restart onboarding"
            description="Prototype — sign out and open the full-screen welcome flow."
          >
            <DashBtn onClick={onRestartOnboarding}>Start onboarding</DashBtn>
          </SettingsRow>
          <SettingsRow
            label="Log out"
            description="Sign out on this device."
          >
            <DashBtn onClick={onLogout}>Log out</DashBtn>
          </SettingsRow>
          <SettingsRow
            label="Delete account"
            description="Prototype only — toggles a local deleted state; nothing is removed from a server."
          >
            <button
              type="button"
              onClick={() => setGone(true)}
              className="inline-flex h-10 items-center rounded-[10px] border border-destructive/30 px-4 text-[13.5px] font-medium tracking-[-0.01em] text-destructive hover:bg-destructive/10"
            >
              {gone ? "Deleted" : "Delete account"}
            </button>
          </SettingsRow>
        </SettingsGroup>
        )}
      </div>
    </SettingsPage>
  );
}
