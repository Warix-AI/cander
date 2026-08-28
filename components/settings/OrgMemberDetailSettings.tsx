"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { MemberPlanToggle } from "@/components/settings/MemberPlanToggle";
import {
  SettingsFootnote,
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsChrome";
import { OrgMemberAccessMobile, OrgMemberAccessPanel } from "@/components/settings/OrgMemberAccessPanel";
import { planLabel } from "@/lib/billing";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getWorkspaceCatalogSnapshot } from "@/lib/workspace-catalog";
import { workspaceKindOf } from "@/lib/workspace-kind";
import { isMobileShell } from "@/lib/mobile-shell";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { removeOrgMember, setMemberOrgPlan } from "@/lib/workspace-policy";

type Props = {
  memberId: string;
  onBack: () => void;
};

export function OrgMemberDetailSettings({ memberId, onBack }: Props) {
  const {
    orgMembers,
    actor,
    entitlements,
    workspacePolicies,
  } = useApp();
  const nativeShell = isMobileShell();
  const mobile = useMobileShell();
  const member = orgMembers.find((item) => item.id === memberId);
  const orgId = actor.orgId;
  const orgWorkspaces = getWorkspaceCatalogSnapshot().filter(
    (item) => workspaceKindOf(item) === "business",
  );
  const [planError, setPlanError] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);

  if (!member) {
    return (
      <SettingsPage>
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.7} />
          Organization
        </button>
        <p className="text-[13px] text-muted-foreground">Member not found.</p>
      </SettingsPage>
    );
  }

  const pending = member.seatStatus === "pending";
  const seatPlan: "pro" | "max" = member.plan === "max" ? "max" : "pro";
  const canEditPlan =
    entitlements.canManageMembers &&
    !nativeShell &&
    member.role !== "Owner";
  const canEditAccess =
    entitlements.canManageMembers && !nativeShell && !pending;
  const canRemove =
    entitlements.canManageMembers &&
    !nativeShell &&
    member.id !== actor.id &&
    member.role !== "Owner";

  const changeMemberPlan = async (plan: "pro" | "max") => {
    if (plan === seatPlan || !orgId) return;
    setPlanBusy(true);
    setPlanError(null);
    setMemberOrgPlan(member.id, plan);
    if (!isSupabaseConfigured()) {
      setPlanBusy(false);
      return;
    }
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in to update seats.");
      const response = await fetch("/api/org/members/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ memberId: member.id, orgId, plan }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMemberOrgPlan(member.id, seatPlan);
        throw new Error(data.error ?? "Could not update seat plan.");
      }
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Could not update seat plan.");
    } finally {
      setPlanBusy(false);
    }
  };

  const removeMember = async () => {
    if (!orgId) return;
    setRemoveBusy(true);
    setPlanError(null);
    if (!isSupabaseConfigured()) {
      removeOrgMember(member.id);
      setRemoveBusy(false);
      onBack();
      return;
    }
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in to remove members.");
      const response = await fetch("/api/org/members/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orgId, memberId: member.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not remove member.");
      removeOrgMember(member.id);
      onBack();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Could not remove member.");
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <SettingsPage>
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors duration-200 hover:text-foreground max-lg:hidden"
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.7} />
        Organization
      </button>
      <SettingsHeader
        title={member.id === actor.id ? `${member.name} (You)` : member.name}
        subtitle={member.email}
      />

      {planError ? (
        <p className="mt-4 text-[12.5px] text-destructive">{planError}</p>
      ) : null}

      <SettingsSection title="Seat" className="mt-6">
        <SettingsGroup>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              {member.role === "Owner" ? (
                <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">
                  Owner
                </span>
              ) : null}
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
                  pending
                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                )}
              >
                {pending ? "Pending" : "Active"}
              </span>
            </div>
            {canEditPlan ? (
              <MemberPlanToggle
                value={seatPlan}
                disabled={planBusy}
                label={`Plan for ${member.name}`}
                onChange={(plan) => void changeMemberPlan(plan)}
              />
            ) : (
              <span className="text-[13px] font-medium">{planLabel(member.plan)}</span>
            )}
          </div>
        </SettingsGroup>
        <SettingsFootnote>
          Billing prorates on the owner&apos;s subscription when plans change.
        </SettingsFootnote>
      </SettingsSection>

      {!pending && canEditAccess ? (
        <SettingsSection title="Access" className="mt-8">
          {mobile ? (
            <OrgMemberAccessMobile
              member={member}
              orgWorkspaces={orgWorkspaces}
              workspacePolicies={workspacePolicies}
              canEdit={canEditAccess}
              orgId={orgId}
            />
          ) : (
            <SettingsGroup>
              <OrgMemberAccessPanel
                member={member}
                orgWorkspaces={orgWorkspaces}
                workspacePolicies={workspacePolicies}
                canEdit={canEditAccess}
                orgId={orgId}
                embedded
              />
            </SettingsGroup>
          )}
        </SettingsSection>
      ) : null}

      {canRemove || (canEditPlan && pending) ? (
        <SettingsSection title="Actions" className="mt-8">
          <SettingsGroup>
            <div className="px-4 py-4">
              <button
                type="button"
                disabled={removeBusy}
                onClick={() => void removeMember()}
                className="text-[13px] font-medium text-destructive hover:text-destructive/80 disabled:opacity-50"
              >
                {removeBusy
                  ? "Removing…"
                  : pending
                    ? "Revoke invite"
                    : "Remove member"}
              </button>
            </div>
          </SettingsGroup>
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}
