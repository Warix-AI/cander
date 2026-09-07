"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Building2,
  ChartNoAxesColumn,
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
import { UsageSettings } from "@/components/settings/UsageSettings";
import {
  SettingsField,
  SettingsFootnote,
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsPanel,
  SettingsSection,
  SettingsStatGrid,
  settingsInputClass,
} from "@/components/settings/SettingsChrome";
import { WorkspacesSettings } from "@/components/settings/WorkspaceSettings";
import { OrgMemberDetailSettings } from "@/components/settings/OrgMemberDetailSettings";
import { OrgInviteModal } from "@/components/settings/OrgInviteModal";
import { Modal } from "@/components/ui/Modal";
import {
  orgMembersOf,
} from "@/lib/entitlements";
import { planLabel } from "@/lib/billing";
import {
  getOrgIdSnapshot,
  getOrgNameSnapshot,
  persistOrgId,
  persistOrgName,
  persistOrgSetupDeferred,
} from "@/lib/org-onboarding";
import { setupOrgOnSupabase } from "@/lib/supabase/setup-org-onboarding";
import { getWorkspaceCatalogSnapshot, upsertCatalogWorkspace } from "@/lib/workspace-catalog";
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
  removeOrgMember,
  upsertOrgMember,
} from "@/lib/workspace-policy";

const settingsIcons: Record<SettingsTab, typeof Building2> = {
  organization: Building2,
  workspaces: LayoutGrid,
  plans: CreditCard,
  usage: ChartNoAxesColumn,
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
    if (
      settingsTab === "organization" &&
      !entitlements.showOrgSettings &&
      !entitlements.canActivateOrganization
    ) {
      setSettingsTab("plans");
    }
  }, [
    settingsTab,
    entitlements.hasWorkspaces,
    entitlements.showOrgSettings,
    entitlements.canActivateOrganization,
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
      <SettingsGroup dividerInset="icon" glass={false}>
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
    <div className={cn("settings-screen-canvas min-h-0 flex-1 overflow-y-auto", MOBILE_APP_BG)}>
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

      {settingsTab === "usage" ? <UsageSettings /> : null}

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
        <div className="settings-screen-canvas min-h-0 flex-1 overflow-y-auto">
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

          {settingsTab === "usage" ? <UsageSettings /> : null}

          {settingsTab === "general" ? (
            <GeneralSettings onAfterSignOut={() => leave()} />
          ) : null}

          {settingsTab === "appearance" ? <AppearanceSettings /> : null}
        </div>
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
  const [inviteWarning] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem("cander-invite-send-warning");
  });
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [activateName, setActivateName] = useState("");
  const [activateBusy, setActivateBusy] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState("");
  const [deactivateBusy, setDeactivateBusy] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!inviteWarning) return;
    window.sessionStorage.removeItem("cander-invite-send-warning");
  }, [inviteWarning]);

  const activateOrganization = async () => {
    const name = activateName.trim() || actor.managedByOrgName?.trim() || orgDisplayName.trim();
    if (!name || name === "Organization") {
      setActivateError("Add your organization name.");
      return;
    }
    setActivateBusy(true);
    setActivateError(null);
    try {
      const workspaceId =
        orgWorkspaces[0]?.id ??
        actor.workspaceIds[0] ??
        getWorkspaceCatalogSnapshot()[0]?.id ??
        null;
      if (!workspaceId) {
        throw new Error("Create a workspace before activating your organization.");
      }
      if (isSupabaseConfigured()) {
        let orgIdCreated = actor.orgId || getOrgIdSnapshot();
        if (orgIdCreated) {
          const supabase = createSupabaseBrowserClient();
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session?.access_token) throw new Error("Sign in to activate your organization.");
          const response = await fetch("/api/org/reactivate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ orgId: orgIdCreated, name }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Could not activate organization.");
          orgIdCreated = data.orgId ?? orgIdCreated;
        } else {
          orgIdCreated = await setupOrgOnSupabase({
            orgName: name,
            workspaceId,
            invites: [],
          });
        }
        upsertOrgMember({
          ...actor,
          orgId: orgIdCreated,
          kind: "org",
          managedByOrgName: name,
          orgSetupDeferred: false,
        });
      } else {
        persistOrgName(name);
        persistOrgId(actor.orgId || `local-org-${actor.id}`);
        upsertOrgMember({
          ...actor,
          orgId: actor.orgId || `local-org-${actor.id}`,
          kind: "org",
          managedByOrgName: name,
          orgSetupDeferred: false,
        });
      }
      const actorWorkspaceIds = new Set([...actor.workspaceIds, workspaceId]);
      getWorkspaceCatalogSnapshot()
        .filter((workspace) => actorWorkspaceIds.has(workspace.id))
        .forEach((workspace) =>
          upsertCatalogWorkspace({ ...workspace, kind: "business", personal: false }),
        );
      persistOrgName(name);
      persistOrgSetupDeferred(false);
      setActivateName("");
      setActivateOpen(false);
    } catch (err) {
      setActivateError(
        err instanceof Error ? err.message : "Could not finish organization setup.",
      );
    } finally {
      setActivateBusy(false);
    }
  };

  const deactivateOrganization = async () => {
    if (deactivateConfirm.trim().toLowerCase() !== "deactivate") {
      setDeactivateError('Type "deactivate" to confirm.');
      return;
    }
    setDeactivateBusy(true);
    setDeactivateError(null);
    try {
      if (isSupabaseConfigured()) {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Sign in to deactivate your organization.");
        const response = await fetch("/api/org/deactivate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ orgId: orgId || undefined }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not deactivate organization.");
        getWorkspaceCatalogSnapshot()
          .filter((workspace) => workspaceKindOf(workspace) === "business")
          .forEach((workspace) =>
            upsertCatalogWorkspace({ ...workspace, kind: "personal", personal: true }),
          );
        persistOrgName(orgDisplayName);
        persistOrgSetupDeferred(true);
        if (data.orgId) persistOrgId(String(data.orgId));
        upsertOrgMember({
          ...actor,
          kind: "personal",
          orgId: (data.orgId ?? actor.orgId ?? getOrgIdSnapshot()) || undefined,
          managedByOrgName: orgDisplayName,
          orgSetupDeferred: true,
        });
        if (!data.orgId) {
          persistOrgId("");
          upsertOrgMember({
            ...actor,
            kind: "personal",
            orgId: undefined,
            managedByOrgName: orgDisplayName,
            orgSetupDeferred: true,
          });
          setDeactivateConfirm("");
          setDeactivateOpen(false);
          return;
        }
        window.location.reload();
        return;
      }

      if (orgMembers.some((member) => member.kind === "org" && member.id !== actor.id)) {
        throw new Error("Remove all other organization users before deactivating.");
      }
      orgMembers
        .filter((member) => member.kind === "org")
        .forEach((member) => removeOrgMember(member.id));
      getWorkspaceCatalogSnapshot()
        .filter((workspace) => workspaceKindOf(workspace) === "business")
        .forEach((workspace) =>
          upsertCatalogWorkspace({ ...workspace, kind: "personal", personal: true }),
        );
      // Keep the organization identity so the owner can activate it again later.
      persistOrgName(orgDisplayName);
      persistOrgId(orgId || actor.orgId || `local-org-${actor.id}`);
      persistOrgSetupDeferred(true);
      upsertOrgMember({
        ...actor,
        kind: "personal",
        orgId: orgId || actor.orgId || `local-org-${actor.id}`,
        managedByOrgName: orgDisplayName,
        orgSetupDeferred: true,
      });
      setDeactivateConfirm("");
      setDeactivateOpen(false);
    } catch (err) {
      setDeactivateError(
        err instanceof Error ? err.message : "Could not deactivate organization.",
      );
    } finally {
      setDeactivateBusy(false);
    }
  };

  const orgWorkspaces = getWorkspaceCatalogSnapshot().filter(
    (item) => workspaceKindOf(item) === "business",
  );
  const overviewItems = [
    { label: "Name", value: orgDisplayName },
    { label: "Users", value: `${roster.length}` },
  ];
  const organizationActive = entitlements.inOrg && !actor.orgSetupDeferred;

  if (!organizationActive) {
    return (
      <SettingsPage>
        <SettingsHeader title="Organization" />
        <SettingsSection className="mt-2 lg:mt-8">
          <SettingsPanel>
            <p className="text-[1.15rem] font-medium tracking-[-0.02em]">
              Activate Organization
            </p>
            <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
              Bring teammates together, invite users, and manage shared workspace access from one place.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {[
                ["Invite teammates", "Bring your team into shared workspaces."],
                ["Manage access", "Choose which workspaces each user can see."],
                ["Shared controls", "Keep connectors and workspace policies together."],
              ].map(([title, description]) => (
                <div key={title} className="rounded-[14px] bg-muted/35 px-3.5 py-3">
                  <p className="text-[13px] font-medium">{title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setActivateError(null);
                setActivateName(actor.managedByOrgName || getOrgNameSnapshot() || "");
                setActivateOpen(true);
              }}
              className="mt-5 inline-flex h-10 items-center rounded-full bg-primary px-5 text-[13.5px] font-medium text-primary-foreground hover:bg-primary/90"
            >
              Activate
            </button>
          </SettingsPanel>
        </SettingsSection>
        <Modal
          open={activateOpen}
          onClose={() => setActivateOpen(false)}
          labelledBy="activate-org-title"
          className="settings-glass-surface w-full max-w-[26rem] border border-foreground/10 p-5"
          backdropClassName="bg-black/10"
        >
          <h3 id="activate-org-title" className="text-[1.1rem] font-medium">Activate Organization</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Name your organization to start inviting users and managing workspace access.
          </p>
          <input
            value={activateName}
            onChange={(event) => {
              setActivateName(event.target.value);
              setActivateError(null);
            }}
            placeholder="Organization name"
            className={cn(settingsInputClass, "mt-4")}
            autoFocus
          />
          {activateError ? <p className="mt-2 text-[12.5px] text-destructive">{activateError}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setActivateOpen(false)} className="inline-flex h-9 items-center rounded-full px-4 text-[13px] hover:bg-muted">Cancel</button>
            <button type="button" disabled={activateBusy} onClick={() => void activateOrganization()} className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground disabled:opacity-50">
              {activateBusy ? "Activating…" : "Activate"}
            </button>
          </div>
        </Modal>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage>
      <SettingsHeader
        title="Organization"
        actions={
          entitlements.canManageMembers && !nativeShell ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-primary/90"
              >
                + Invite
              </button>
              {entitlements.isOwner ? (
                <button
                  type="button"
                  onClick={() => {
                    setDeactivateError(null);
                    setDeactivateConfirm("");
                    setDeactivateOpen(true);
                  }}
                  className="inline-flex h-9 items-center rounded-full border border-foreground/15 px-4 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted"
                >
                  Settings
                </button>
              ) : null}
            </div>
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

      <Modal
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        labelledBy="deactivate-org-title"
        className="settings-glass-surface w-full max-w-[26rem] border border-foreground/10 p-5"
        backdropClassName="bg-black/10"
      >
        <h3 id="deactivate-org-title" className="text-[1.1rem] font-medium">
          Deactivate Organization
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          This deactivates organization features while keeping the organization, your account, and workspaces. You can activate it again later. Remove all other users before deactivating.
        </p>
        <input
          value={deactivateConfirm}
          onChange={(event) => {
            setDeactivateConfirm(event.target.value);
            setDeactivateError(null);
          }}
          placeholder='Type "deactivate" to confirm'
          className={cn(settingsInputClass, "mt-4")}
          autoFocus
        />
        {deactivateError ? <p className="mt-2 text-[12.5px] text-destructive">{deactivateError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setDeactivateOpen(false)} className="inline-flex h-9 items-center rounded-full px-4 text-[13px] hover:bg-muted">Cancel</button>
          <button type="button" disabled={deactivateBusy} onClick={() => void deactivateOrganization()} className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground disabled:opacity-50">
            {deactivateBusy ? "Deactivating…" : "Deactivate"}
          </button>
        </div>
      </Modal>

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

      <SettingsSection className="mt-2 lg:mt-8">
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


      <SettingsSection title="Users">
        <SettingsGroup dividerInset="icon">
          {roster.map((member) => {
            const pending = member.seatStatus === "pending";
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => onSelectMember(member.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-muted/50"
              >
                <AccountAvatar
                  memberId={member.id}
                  name={member.name}
                  initials={member.initials}
                  size="md"
                />
                <span className="min-w-0 flex-1">
                  <span className="text-[13.5px] font-medium tracking-[-0.01em]">
                    {member.name}
                  </span>
                </span>
                <span
                  className={cn(
                    "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium tracking-[-0.01em]",
                    pending
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  )}
                >
                  {pending ? "Pending" : "Active"}
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
  const mobile = useMobileShell();
  const { actor, entitlements } = useApp();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [fullName, setFullName] = useState(() => actor.name);
  const [profileError, setProfileError] = useState<string | null>(null);
  const profileSaveTimer = useRef<number | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const photos = useSyncExternalStore(
    subscribeProfilePhotos,
    getProfilePhotosSnapshot,
    getProfilePhotosServerSnapshot,
  );
  const photo = profilePhotoFor(actor.id, photos);

  const saveProfile = async (nextFullName: string) => {
    const name = nextFullName.trim();
    if (!name) {
      setProfileError("Add your full name.");
      return;
    }
    const displayShort = name.split(/\s+/)[0] || "You";
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
      setProfileError(null);
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Could not save profile.",
      );
    }
  };

  const scheduleProfileSave = (nextFullName: string) => {
    if (profileSaveTimer.current != null) {
      window.clearTimeout(profileSaveTimer.current);
    }
    profileSaveTimer.current = window.setTimeout(() => {
      profileSaveTimer.current = null;
      void saveProfile(nextFullName);
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (profileSaveTimer.current != null) {
        window.clearTimeout(profileSaveTimer.current);
      }
    };
  }, []);

  const saveProfileField = (nextName: string) => {
    setFullName(nextName);
    setProfileError(null);
    scheduleProfileSave(nextName);
  };

  const profilePhotoCard = (
    <div className="settings-glass-row flex flex-wrap items-center gap-4 px-4 py-4">
      <AccountAvatar
        memberId={actor.id}
        name={actor.name}
        initials={actor.initials}
        size="lg"
      />
      <div className="min-w-0 flex-1">
          <p className={cn("font-medium tracking-[-0.01em]", mobile ? "text-[15px]" : "text-[13.5px]")}>Profile photo</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPhotoError(null);
                photoInput.current?.click();
              }}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 font-medium tracking-[-0.01em] hover:bg-muted",
                mobile ? "h-9 text-[13px]" : "h-8 text-[12.5px]",
                "rounded-full border border-foreground/15",
              )}
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
                err instanceof Error ? err.message : "Could not upload image.",
              );
            });
        }}
      />
    </div>
  );

  const profileFieldCards = (
    <>
      <div className="settings-glass-row px-4 py-4">
          <SettingsField label="Full name">
            <input
              value={fullName}
              onChange={(event) => saveProfileField(event.target.value)}
              className={settingsInputClass}
            />
          </SettingsField>
      </div>
      <div className="settings-glass-row px-4 py-4">
          <SettingsField label="Email">
            <input
              value={actor.email}
              readOnly
              className={cn(settingsInputClass, "bg-muted/40 text-muted-foreground")}
            />
          </SettingsField>
      </div>
      {profileError ? (
        <p className="px-1 text-[12.5px] text-destructive">{profileError}</p>
      ) : null}
    </>
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
        )}
      >
        <SettingsSection className="mt-2 lg:mt-8">
          <SettingsGroup>
            {profilePhotoCard}
            {profileFieldCards}
          </SettingsGroup>
        </SettingsSection>

        <AccountSecuritySettings onAfterSignOut={onAfterSignOut} />
      </div>
    </SettingsPage>
  );
}
