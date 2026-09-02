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
import { UsageStatusPanel } from "@/components/settings/UsageStatusPanel";
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
} from "@/components/settings/SettingsChrome";
import { WorkspacesSettings } from "@/components/settings/WorkspaceSettings";
import { OrgMemberDetailSettings } from "@/components/settings/OrgMemberDetailSettings";
import { OrgInviteModal } from "@/components/settings/OrgInviteModal";
import {
  memberName,
  orgMembersOf,
  orgMaxSeats,
} from "@/lib/entitlements";
import { orgSeatMix, planLabel, seatMixLabel } from "@/lib/billing";
import {
  getOrgIdSnapshot,
  getOrgNameSnapshot,
  persistOrgName,
  persistOrgSetupDeferred,
} from "@/lib/org-onboarding";
import { setupOrgOnSupabase } from "@/lib/supabase/setup-org-onboarding";
import { getWorkspaceCatalogSnapshot } from "@/lib/workspace-catalog";
import { webAppOrgSettingsUrl } from "@/lib/plans";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { isMobileShell, openExternalUrl } from "@/lib/mobile-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SettingsTab } from "@/lib/types";
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
  upsertOrgMember,
} from "@/lib/workspace-policy";

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
    settingsOrgMemberId,
    setSettingsOrgMemberId,
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
      : settingsTab === "organization" && settingsOrgMemberId
        ? `organization/${settingsOrgMemberId}`
        : settingsTab;
  const stackDepth = settingsMobileHub
    ? 0
    : settingsTab === "workspaces" && settingsWorkspaceId
      ? 2
      : settingsTab === "organization" && settingsOrgMemberId
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
        ) : settingsOrgMemberId ? (
          <OrgMemberDetailSettings
            memberId={settingsOrgMemberId}
            onBack={() => setSettingsOrgMemberId(null)}
          />
        ) : (
          <OrganizationSettings
            onSelectMember={(memberId) => setSettingsOrgMemberId(memberId)}
          />
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
            ) : settingsOrgMemberId ? (
              <OrgMemberDetailSettings
                memberId={settingsOrgMemberId}
                onBack={() => setSettingsOrgMemberId(null)}
              />
            ) : (
              <OrganizationSettings
                onSelectMember={(memberId) => setSettingsOrgMemberId(memberId)}
              />
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

function OrganizationSettings({
  onSelectMember,
}: {
  onSelectMember: (memberId: string) => void;
}) {
  const {
    orgMembers,
    actor,
    entitlements,
  } = useApp();
  const nativeShell = isMobileShell();
  const orgDisplayName = getOrgNameSnapshot() || actor.managedByOrgName || "Organization";
  const orgId = actor.orgId || getOrgIdSnapshot();
  const roster = orgMembersOf(orgMembers);
  const [inviteWarning, setInviteWarning] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [finishOrgName, setFinishOrgName] = useState("");
  const [finishBusy, setFinishBusy] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const warning = window.sessionStorage.getItem("cander-invite-send-warning");
    if (!warning) return;
    window.sessionStorage.removeItem("cander-invite-send-warning");
    setInviteWarning(warning);
  }, []);

  const finishOrgSetup = async () => {
    const name = finishOrgName.trim() || orgDisplayName.trim();
    if (!name || name === "Organization") {
      setFinishError("Add your organization name.");
      return;
    }
    setFinishBusy(true);
    setFinishError(null);
    try {
      const workspaceId =
        orgWorkspaces[0]?.id ?? actor.workspaceIds[0] ?? null;
      if (!workspaceId) {
        throw new Error("Create a workspace before finishing org setup.");
      }
      if (isSupabaseConfigured()) {
        const orgIdCreated = await setupOrgOnSupabase({
          orgName: name,
          workspaceId,
          invites: [],
        });
        upsertOrgMember({
          ...actor,
          orgId: orgIdCreated,
          kind: "org",
          orgSetupDeferred: false,
        });
      } else {
        persistOrgName(name);
        upsertOrgMember({
          ...actor,
          kind: "org",
          orgSetupDeferred: false,
        });
      }
      persistOrgName(name);
      persistOrgSetupDeferred(false);
      setFinishOrgName("");
    } catch (err) {
      setFinishError(
        err instanceof Error ? err.message : "Could not finish organization setup.",
      );
    } finally {
      setFinishBusy(false);
    }
  };

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

  return (
    <SettingsPage>
      <SettingsHeader
        title="Organization"
        actions={
          entitlements.canManageMembers && !nativeShell && !actor.orgSetupDeferred ? (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-primary/90"
            >
              + Invite
            </button>
          ) : null
        }
      />

      <OrgInviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        orgId={orgId ?? ""}
        workspaceIds={orgWorkspaces.map((item) => item.id)}
        ownerEmail={actor.email}
        onInvited={(message) => {
          if (message) setInviteMessage(message);
        }}
      />

      {inviteWarning ? (
        <p className="mt-4 text-[12.5px] leading-relaxed text-destructive">
          {inviteWarning}
        </p>
      ) : null}
      {inviteMessage ? (
        <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground">
          {inviteMessage}
        </p>
      ) : null}

      {actor.orgSetupDeferred ? (
        <SettingsSection
          title="Finish setup"
          description="Name your organization to unlock teammate invites."
          className="mt-2 lg:mt-8"
        >
          <SettingsPanel>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              You chose Max with org setup later. Add your organization name to
              finish.
            </p>
            <input
              value={finishOrgName}
              onChange={(event) => {
                setFinishOrgName(event.target.value);
                setFinishError(null);
              }}
              placeholder="Organization name"
              className={cn(settingsInputClass, "mt-4")}
            />
            {finishError ? (
              <p className="mt-2 text-[12.5px] text-destructive">{finishError}</p>
            ) : null}
            <div className="mt-4">
              <button
                type="button"
                disabled={finishBusy}
                onClick={() => void finishOrgSetup()}
                className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-[13.5px] font-medium tracking-[-0.01em] text-primary-foreground disabled:opacity-50"
              >
                {finishBusy ? "Saving…" : "Create organization"}
              </button>
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


      <SettingsSection
        title="Users"
        description="Invite Pro or Max seats — mixed rosters are supported. Open a user to manage access and billing."
      >
        <SettingsGroup dividerInset="icon">
          {roster.map((member) => {
            const pending = member.seatStatus === "pending";
            const seatPlan: "pro" | "max" =
              member.plan === "max" ? "max" : "pro";
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => onSelectMember(member.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium tracking-[-0.01em]">
                      {member.id === actor.id
                        ? `${member.name} (You)`
                        : member.name}
                    </span>
                    {member.role === "Owner" ? (
                      <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-medium tracking-[-0.01em] text-muted-foreground">
                        Owner
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium tracking-[-0.01em]",
                        pending
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                      )}
                    >
                      {pending ? "Pending" : "Active"}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                    {member.email}
                  </span>
                </span>
                <span className="hidden shrink-0 text-[12.5px] font-medium text-muted-foreground sm:block">
                  {planLabel(seatPlan)}
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground/70"
                  strokeWidth={1.8}
                />
              </button>
            );
          })}
        </SettingsGroup>
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
  const [fullName, setFullName] = useState("");
  const [shortName, setShortName] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const mobile = useMobileShell();
  const { actor, entitlements } = useApp();
  const photos = useSyncExternalStore(
    subscribeProfilePhotos,
    getProfilePhotosSnapshot,
    getProfilePhotosServerSnapshot,
  );
  const photo = profilePhotoFor(actor.id, photos);

  const managed = entitlements.showOrgManaged;

  useEffect(() => {
    setFullName(actor.name);
    setShortName(actor.short);
  }, [actor.id, actor.name, actor.short]);

  const saveProfile = async () => {
    const short = shortName.trim() || actor.short || "You";
    if (managed) {
      setProfileBusy(true);
      setProfileError(null);
      setProfileSaved(false);
      try {
        upsertOrgMember({ ...actor, short });
        if (isSupabaseConfigured()) {
          const supabase = createSupabaseBrowserClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Sign in to save your profile.");
          const { error } = await supabase
            .from("profiles")
            .update({ short_name: short })
            .eq("id", user.id);
          if (error && !/short_name|42703|column/i.test(error.message)) {
            throw error;
          }
        }
        setProfileSaved(true);
      } catch (err) {
        setProfileError(
          err instanceof Error ? err.message : "Could not save profile.",
        );
      } finally {
        setProfileBusy(false);
      }
      return;
    }

    const name = fullName.trim();
    const displayShort = shortName.trim() || name.split(/\s+/)[0] || "You";
    if (!name) {
      setProfileError("Add your full name.");
      return;
    }
    setProfileBusy(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      const initials = name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      upsertOrgMember({
        ...actor,
        name,
        short: displayShort,
        initials: initials || actor.initials,
      });

      if (isSupabaseConfigured()) {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Sign in to save your profile.");
        const { error } = await supabase
          .from("profiles")
          .update({ name, short_name: displayShort })
          .eq("id", user.id);
        if (error && /short_name|42703|column/i.test(error.message)) {
          const retry = await supabase
            .from("profiles")
            .update({ name })
            .eq("id", user.id);
          if (retry.error) throw retry.error;
        } else if (error) {
          throw error;
        }
      }
      setProfileSaved(true);
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Could not save profile.",
      );
    } finally {
      setProfileBusy(false);
    }
  };

  const profileFields = (
    <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
      <SettingsField label="Full name">
        <input
          value={fullName}
          onChange={(event) => {
            if (managed) return;
            setFullName(event.target.value);
            setProfileSaved(false);
            setProfileError(null);
          }}
          readOnly={managed}
          className={cn(
            settingsInputClass,
            managed && "bg-muted/40 text-muted-foreground",
          )}
        />
      </SettingsField>
      <SettingsField
        label="Email"
        hint={
          managed
            ? "Managed by your organization."
            : "Change email in Account security below."
        }
      >
        <input
          value={actor.email}
          readOnly
          className={cn(settingsInputClass, "bg-muted/40 text-muted-foreground")}
        />
      </SettingsField>
      <SettingsField label="What should we call you?">
        <input
          value={shortName}
          onChange={(event) => {
            setShortName(event.target.value);
            setProfileSaved(false);
            setProfileError(null);
          }}
          className={settingsInputClass}
        />
      </SettingsField>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <button
          type="button"
          disabled={profileBusy}
          onClick={() => void saveProfile()}
          className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {profileBusy ? "Saving…" : managed ? "Save" : "Save profile"}
        </button>
        {profileSaved ? (
          <span className="text-[12.5px] text-muted-foreground">Saved</span>
        ) : null}
        {profileError ? (
          <span className="text-[12.5px] text-destructive">{profileError}</span>
        ) : null}
      </div>
    </div>
  );

  return (
    <SettingsPage>
      <SettingsHeader title="General" />

      {!entitlements.showOrgSettings ? (
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          Organization and Workspaces admin tabs are for owners and admins.
        </p>
      ) : null}

      <div
        className={cn(
          !entitlements.showOrgSettings ? "mt-4" : "mt-2",
          mobile ? "space-y-6" : "space-y-3",
        )}
      >
        {mobile ? (
          <SettingsSection title="Profile">
            <SettingsGroup>
              <div
                className={cn(
                  "flex flex-wrap items-center gap-4 px-4",
                  mobile ? "py-3.5" : "py-4",
                )}
              >
                <AccountAvatar
                  memberId={actor.id}
                  name={actor.name}
                  initials={actor.initials}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "font-medium tracking-[-0.01em]",
                      mobile ? "text-[15px]" : "text-[13.5px]",
                    )}
                  >
                    Profile photo
                  </p>
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
                    <p className="mt-2 text-[12.5px] text-destructive">
                      {photoError}
                    </p>
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
              {profileFields}
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
                  <p className="mt-2 text-[12.5px] text-destructive">
                    {photoError}
                  </p>
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
            {profileFields}
          </SettingsGroup>
        )}

        <UsageStatusPanel />

        <AccountSecuritySettings onAfterSignOut={onAfterSignOut} />
      </div>
    </SettingsPage>
  );
}
