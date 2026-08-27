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
import {
  MobileSlideStack,
  useMobileStackDirection,
} from "@/components/shell/mobile/MobileSlideStack";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { PlansSettings } from "@/components/settings/PlansSettings";
import { AccountSecuritySettings } from "@/components/settings/AccountSecuritySettings";
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
import { MemberPlanToggle } from "@/components/settings/MemberPlanToggle";
import { OrgTeammateInvitePanel } from "@/components/settings/OrgTeammateInvitePanel";
import {
  memberName,
  orgMembersOf,
  orgMaxSeats,
} from "@/lib/entitlements";
import { orgSeatMix, planLabel, seatMixLabel } from "@/lib/billing";
import { getOrgIdSnapshot, getOrgNameSnapshot } from "@/lib/org-onboarding";
import { getWorkspaceCatalogSnapshot } from "@/lib/workspace-catalog";
import { webAppOrgSettingsUrl } from "@/lib/plans";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { isMobileShell, openExternalUrl } from "@/lib/mobile-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Role, SettingsTab } from "@/lib/types";
import { MOBILE_APP_BG } from "@/lib/mobile-menu-styles";
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
import { visibleSettingsTabs } from "@/lib/settings-nav";
import { useMobileShell } from "@/lib/use-media-query";
import {
  setMemberRole,
  setMemberOrgPlan,
  toggleMemberWorkspace,
  removeOrgMember,
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
    if (settingsTab === "workspaces" && !entitlements.hasWorkspaces) {
      setSettingsTab("plans");
    }
    if (settingsTab === "organization" && !entitlements.showOrgSettings) {
      setSettingsTab("plans");
    }
  }, [
    settingsTab,
    entitlements.hasWorkspaces,
    entitlements.showOrgSettings,
    setSettingsTab,
  ]);

  const leave = () => {
    if (canGoBack) goBack();
    else newChat();
  };

  const stackKey = settingsMobileHub
    ? "hub"
    : settingsTab === "workspaces" && settingsWorkspaceId
      ? `workspaces/${settingsWorkspaceId}`
      : settingsTab;
  const stackDepth = settingsMobileHub
    ? 0
    : settingsTab === "workspaces" && settingsWorkspaceId
      ? 2
      : 1;
  const stackDirection = useMobileStackDirection(stackDepth);

  const settingsBody = settingsMobileHub ? (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-2 lg:hidden", MOBILE_APP_BG)}>
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
    <div className={cn("min-h-0 flex-1 overflow-y-auto", MOBILE_APP_BG)}>
      {settingsTab === "organization" ? (
        entitlements.showOrgManaged ? (
          <ManagedOrganizationSettings />
        ) : (
          <OrganizationSettings />
        )
      ) : null}

      {settingsTab === "workspaces" ? (
        <WorkspacesSettings
          selectedId={settingsWorkspaceId}
          onSelect={setSettingsWorkspaceId}
        />
      ) : null}

      {settingsTab === "plans" ? <PlansSettings /> : null}

      {settingsTab === "general" ? (
        <GeneralSettings
          onAfterSignOut={() => leave()}
        />
      ) : null}

      {settingsTab === "appearance" ? <AppearanceSettings /> : null}
    </div>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {mobile ? (
        <MobileSlideStack
          activeKey={stackKey}
          direction={stackDirection}
          frameClassName={MOBILE_APP_BG}
        >
          {settingsBody}
        </MobileSlideStack>
      ) : (
        <>
          {settingsTab === "organization" ? (
            entitlements.showOrgManaged ? (
              <ManagedOrganizationSettings />
            ) : (
              <OrganizationSettings />
            )
          ) : null}

          {settingsTab === "workspaces" ? (
            <WorkspacesSettings
              selectedId={settingsWorkspaceId}
              onSelect={setSettingsWorkspaceId}
            />
          ) : null}

          {settingsTab === "plans" ? <PlansSettings /> : null}

          {settingsTab === "general" ? (
            <GeneralSettings onAfterSignOut={() => leave()} />
          ) : null}

          {settingsTab === "appearance" ? <AppearanceSettings /> : null}
        </>
      )}
    </div>
  );
}

function ManagedOrganizationSettings() {
  const { actor, orgMembers } = useApp();
  const orgName =
    actor.managedByOrgName || getOrgNameSnapshot() || "Your organization";
  const admins = orgMembers.filter(
    (member) =>
      member.kind === "org" &&
      member.seatStatus === "active" &&
      (member.role === "Owner" || member.role === "Admin"),
  );
  const adminLabel =
    admins.map((member) => member.name).join(", ") || "your admin";

  return (
    <SettingsPage>
      <SettingsHeader title="Organization" />

      <SettingsSection title="Managed by" className="mt-2 lg:mt-8">
        <SettingsPanel>
          <p className="text-[14px] font-medium tracking-[-0.02em]">
            {orgName}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Your {planLabel(actor.plan)} seat is managed by {orgName}. Contact{" "}
            {adminLabel} for invites, roles, workspace access, or billing.
          </p>
        </SettingsPanel>
      </SettingsSection>

      <SettingsSection title="Your seat">
        <SettingsStatGrid
          items={[
            { label: "Plan", value: planLabel(actor.plan) },
            { label: "Role", value: actor.role },
            {
              label: "Status",
              value: actor.seatStatus === "active" ? "Active" : "Pending",
            },
          ]}
        />
        <SettingsFootnote className="mt-4">
          {actor.plan === "pro"
            ? "Pro members get personal workspaces and limited org access."
            : "Max members get shared workspace features and org collaboration."}
        </SettingsFootnote>
      </SettingsSection>
    </SettingsPage>
  );
}

function OrganizationSettings() {
  const {
    orgMembers,
    setSettingsTab,
    actor,
    entitlements,
  } = useApp();
  const nativeShell = isMobileShell();
  const orgDisplayName = getOrgNameSnapshot() || actor.managedByOrgName || "Organization";
  const orgId = actor.orgId || getOrgIdSnapshot();
  const roster = orgMembersOf(orgMembers);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState<string | null>(null);
  const [inviteWarning, setInviteWarning] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const warning = window.sessionStorage.getItem("courier-invite-send-warning");
    if (!warning) return;
    window.sessionStorage.removeItem("courier-invite-send-warning");
    setInviteWarning(warning);
  }, []);

  const orgWorkspaces = getWorkspaceCatalogSnapshot().filter(
    (item) => workspaceKindOf(item) === "business",
  );
  const maxSeats = orgMaxSeats(orgMembers);
  const mixLabel = seatMixLabel(orgSeatMix(orgMembers)).join(" · ");
  const domainGuess = (() => {
    const email = actor.email.trim();
    const at = email.lastIndexOf("@");
    if (at < 0) return "";
    const domain = email.slice(at + 1).toLowerCase();
    if (!domain || domain.includes("gmail.") || domain.includes("yahoo.") || domain.includes("outlook.") || domain.includes("icloud.")) {
      return "";
    }
    return domain;
  })();

  const overviewItems = [
    { label: "Legal name", value: orgDisplayName },
    ...(domainGuess ? [{ label: "Domain", value: domainGuess }] : []),
    { label: "Seat mix", value: mixLabel || "None" },
    { label: "Max seats", value: `${maxSeats}` },
    { label: "People", value: `${roster.length}` },
  ];

  const changeMemberPlan = async (
    memberId: string,
    plan: "pro" | "max",
    currentPlan: "pro" | "max",
  ) => {
    if (plan === currentPlan) return;
    setPlanBusy(memberId);
    setPlanError(null);
    setMemberOrgPlan(memberId, plan);

    if (!isSupabaseConfigured() || !orgId) {
      setPlanBusy(null);
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Sign in to update seats.");
      }
      const response = await fetch("/api/org/members/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ memberId, orgId, plan }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMemberOrgPlan(memberId, currentPlan);
        throw new Error(data.error ?? "Could not update seat plan.");
      }
    } catch (err) {
      setPlanError(
        err instanceof Error ? err.message : "Could not update seat plan.",
      );
    } finally {
      setPlanBusy(null);
    }
  };

  const removeMember = async (memberId: string) => {
    if (!orgId) return;
    setRemoveBusy(memberId);
    setPlanError(null);

    if (!isSupabaseConfigured()) {
      removeOrgMember(memberId);
      setRemoveBusy(null);
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Sign in to remove members.");
      }
      const response = await fetch("/api/org/members/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orgId, memberId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove member.");
      }
      removeOrgMember(memberId);
    } catch (err) {
      setPlanError(
        err instanceof Error ? err.message : "Could not remove member.",
      );
    } finally {
      setRemoveBusy(null);
    }
  };

  return (
    <SettingsPage>
      <SettingsHeader title="Organization" />

      {inviteWarning ? (
        <p className="mt-4 text-[12.5px] leading-relaxed text-destructive">
          {inviteWarning}
        </p>
      ) : null}

      {actor.orgSetupDeferred ? (
        <SettingsSection
          title="Finish setup"
          description="Complete organization setup to invite Pro and Max teammates."
          className="mt-2 lg:mt-8"
        >
          <SettingsPanel>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Seat billing is confirmed on the web after setup. Add your org
              name and invites below, or anytime from this tab.
            </p>
            <div className="mt-4">
              <DashBtn onClick={() => setSettingsTab("organization")}>
                Continue setup
              </DashBtn>
            </div>
          </SettingsPanel>
        </SettingsSection>
      ) : null}

      <SettingsSection title="Overview" className={actor.orgSetupDeferred ? "mt-6" : "mt-2 lg:mt-8"}>
        <SettingsStatGrid items={overviewItems} />
      </SettingsSection>

      {nativeShell && entitlements.canManageMembers ? (
        <SettingsSection
          title="Manage on the web"
          description="Seat upgrades, downgrades, and billing run on cander.app in your browser — not in the mobile app."
        >
          <SettingsPanel>
            <button
              type="button"
              onClick={() => openExternalUrl(webAppOrgSettingsUrl())}
              className="inline-flex h-10 items-center rounded-full border border-foreground/15 px-5 text-[13.5px] font-medium tracking-[-0.01em] hover:bg-muted"
            >
              Open organization settings
            </button>
          </SettingsPanel>
        </SettingsSection>
      ) : null}

      {entitlements.canManageMembers && !nativeShell ? (
        <SettingsSection
          title="Invite teammates"
          description="Send Pro or Max invites — mixed rosters are supported."
        >
          <OrgTeammateInvitePanel
            orgId={orgId ?? ""}
            workspaceIds={orgWorkspaces.map((item) => item.id)}
            ownerEmail={actor.email}
          />
        </SettingsSection>
      ) : null}

      <SettingsSection
        title="Users"
        description="Invite Pro or Max seats — mixed rosters are supported. Change plans anytime; billing prorates on the owner’s subscription."
      >
        {planError ? (
          <p className="mb-3 text-[12.5px] text-destructive">{planError}</p>
        ) : null}
        <div className="space-y-3">
          {roster.map((member) => {
            const pending = member.seatStatus === "pending";
            const roleOptions: Role[] = entitlements.isOwner
              ? roles
              : roles.filter((role) => role !== "Owner");
            const canEditRole =
              entitlements.canManageMembers &&
              !nativeShell &&
              (entitlements.isOwner || member.role !== "Owner") &&
              !pending;
            const seatPlan: "pro" | "max" =
              member.plan === "max" ? "max" : "pro";
            const canEditPlan =
              entitlements.canManageMembers &&
              !nativeShell &&
              member.role !== "Owner";
            const canRemove =
              entitlements.canManageMembers &&
              !nativeShell &&
              member.id !== actor.id &&
              member.role !== "Owner" &&
              !pending;
            return (
              <SettingsGroup key={member.id}>
                <SettingsRow
                  label={
                    member.id === actor.id
                      ? `${member.name} (You)`
                      : member.name
                  }
                  description={`${member.email} · ${planLabel(member.plan)}${pending ? " · Pending invite" : ""}`}
                >
                  {pending ? (
                    <span className="text-[12.5px] text-muted-foreground">
                      Pending
                    </span>
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
                {!pending ? (
                  <div className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12px] text-muted-foreground">
                        Seat plan
                        {member.seatStatus === "active" ? " · Active" : ""}
                      </p>
                      {canEditPlan ? (
                        <MemberPlanToggle
                          value={seatPlan}
                          disabled={planBusy === member.id}
                          label={`Plan for ${member.name}`}
                          onChange={(plan) =>
                            void changeMemberPlan(member.id, plan, seatPlan)
                          }
                        />
                      ) : (
                        <span className="text-[12.5px] font-medium text-foreground">
                          {planLabel(member.plan)}
                        </span>
                      )}
                    </div>
                  </div>
                ) : pending && canEditPlan ? (
                  <div className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12px] text-muted-foreground">
                        Invited as
                      </p>
                      <MemberPlanToggle
                        value={seatPlan}
                        disabled={planBusy === member.id}
                        label={`Pending plan for ${member.name}`}
                        onChange={(plan) =>
                          void changeMemberPlan(member.id, plan, seatPlan)
                        }
                      />
                    </div>
                  </div>
                ) : null}
                {!pending && !nativeShell ? (
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
                {canRemove || (canEditPlan && pending) ? (
                  <div className="border-t border-border px-4 py-3">
                    <button
                      type="button"
                      disabled={removeBusy === member.id}
                      onClick={() => void removeMember(member.id)}
                      className="text-[12.5px] font-medium text-destructive hover:text-destructive/80 disabled:opacity-50"
                    >
                      {removeBusy === member.id
                        ? "Removing…"
                        : pending
                          ? "Revoke invite"
                          : "Remove member"}
                    </button>
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
  onAfterSignOut,
}: {
  onAfterSignOut: () => void;
}) {
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

        <AccountSecuritySettings onAfterSignOut={onAfterSignOut} />
      </div>
    </SettingsPage>
  );
}
