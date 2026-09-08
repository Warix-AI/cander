"use client";

import { useState, useSyncExternalStore } from "react";
import { useApp } from "@/components/app/AppProvider";
import { DashBtn } from "@/components/spaces/ItemSet";
import {
  SettingsGroup,
  SettingsSection,
} from "@/components/settings/SettingsChrome";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { signOutAccount, clearLocalAuthState } from "@/lib/auth/sign-out";
import {
  deleteAccount,
  requestPasswordReset,
  signInWithPassword,
  updateEmail,
  updatePassword,
  authEmail,
} from "@/lib/supabase/auth-actions";
import {
  getSupabaseUserServerSnapshot,
  getSupabaseUserSnapshot,
  subscribeSupabaseUser,
} from "@/lib/supabase/auth-store";
import { subscriptionBlocksAccountDeletion } from "@/lib/entitlements";
import { isPaidPlan, webAppPlansSettingsUrl } from "@/lib/plans";
import { isMobileShell, openExternalUrl } from "@/lib/mobile-shell";
import { useMobileShell } from "@/lib/use-media-query";

type Props = {
  onAfterSignOut?: () => void;
};

function formatPeriodEnd(iso: string | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function AccountSecuritySettings({ onAfterSignOut }: Props) {
  const mobile = useMobileShell();
  const nativeShell = isMobileShell();
  const { entitlements, actor, orgMembers, setSettingsTab } = useApp();
  const supabase = isSupabaseConfigured();
  const user = useSyncExternalStore(
    subscribeSupabaseUser,
    getSupabaseUserSnapshot,
    getSupabaseUserServerSnapshot,
  );
  const currentEmail = authEmail(user);
  const managedByOrganization = actor.kind === "org";
  const hasOtherOrgMembers = managedByOrganization && orgMembers.some(
    (member) =>
      member.id !== actor.id &&
      member.kind === "org" &&
      (!actor.orgId || !member.orgId || member.orgId === actor.orgId),
  );

  const [email, setEmail] = useState(currentEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const billingBlocksDelete = subscriptionBlocksAccountDeletion(actor);
  const periodLabel = formatPeriodEnd(actor.subscriptionPeriodEnd);
  const deleteConfirmOk = deleteConfirmText.trim().toLowerCase() === "delete";

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const logout = () =>
    run("logout", async () => {
      await signOutAccount();
      onAfterSignOut?.();
    });

  const sendReset = () =>
    run("reset", async () => {
      const target = (email || currentEmail).trim();
      if (!target.includes("@")) throw new Error("Enter a valid email.");
      await requestPasswordReset(target);
      setMessage(`Password reset email sent to ${target}.`);
    });

  const savePassword = () =>
    run("password", async () => {
      if (!currentPassword) {
        throw new Error("Enter your current password.");
      }
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }
      if (password !== passwordConfirm) {
        throw new Error("Passwords do not match.");
      }
      await signInWithPassword({ email: currentEmail, password: currentPassword });
      await updatePassword(password);
      setCurrentPassword("");
      setPassword("");
      setPasswordConfirm("");
      setMessage("Password updated.");
    });

  const saveEmail = () =>
    run("email", async () => {
      if (!email.trim().includes("@")) throw new Error("Enter a valid email.");
      if (email.trim().toLowerCase() === currentEmail.toLowerCase()) {
        throw new Error("That’s already your email.");
      }
      await updateEmail(email);
      setMessage(
        `Confirmation sent to ${email.trim()}. Keep using ${currentEmail} until you confirm.`,
      );
    });

  const removeAccount = () =>
    run("delete", async () => {
      if (hasOtherOrgMembers) {
        throw new Error("Remove all other organization users before deleting your account.");
      }
      if (!deleteConfirmOk) {
        throw new Error('Type "delete" to confirm.');
      }
      if (!supabase) {
        clearLocalAuthState();
        await signOutAccount();
        onAfterSignOut?.();
        return;
      }
      await deleteAccount();
      clearLocalAuthState();
      await signOutAccount();
      onAfterSignOut?.();
    });

  const deleteDescription = () => {
    if (hasOtherOrgMembers) {
      return "Remove all other organization users before deleting your account.";
    }
    if (managedByOrganization && !entitlements.isOwner) {
      return "Your seat is managed by your organization. Contact an admin to leave.";
    }
    if (billingBlocksDelete) {
      if (isPaidPlan(actor.plan) && !actor.cancelAtPeriodEnd) {
        return "You can’t delete your account until your subscription has been cancelled. Billing runs through the end of your current period.";
      }
      if (periodLabel) {
        return `Your plan stays active until ${periodLabel}. You can delete your account after billing ends.`;
      }
      return "You can’t delete your account until your subscription has been cancelled.";
    }
    if (supabase) {
      return "Permanently deletes your Auth user and cascaded profile data.";
    }
    return "Clears local session data for this browser.";
  };

  return (
    <SettingsSection title="Account">
      <SettingsGroup>
        {supabase ? (
          <div className="settings-glass-row flex flex-col gap-3 px-4 py-4">
              <div>
                <p className="text-[13.5px] font-medium tracking-[-0.01em]">Password</p>
                {!mobile ? (
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    Set a new password while signed in.
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="settings-glass-input h-10 w-full px-3 text-[13.5px] outline-none focus:border-foreground/25 sm:row-span-2"
                />
                <div className="grid gap-2">
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="New password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="settings-glass-input h-10 w-full px-3 text-[13.5px] outline-none focus:border-foreground/25"
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Confirm new password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    className="settings-glass-input h-10 w-full px-3 text-[13.5px] outline-none focus:border-foreground/25"
                  />
                </div>
                <DashBtn onClick={() => void savePassword()}>
                  {busy === "password" ? "Saving…" : "Update password"}
                </DashBtn>
              </div>
          </div>
        ) : null}

        {supabase ? (
          <div className="settings-glass-row flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium tracking-[-0.01em]">Email</p>
                {!mobile ? (
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {managedByOrganization
                      ? "Your organization manages this email address."
                      : "Change email — confirm via the link we send to the new address."}
                  </p>
                ) : null}
                <input
                  type="email"
                  value={email}
                  readOnly={managedByOrganization}
                  onChange={(event) => setEmail(event.target.value)}
                  className="settings-glass-input mt-3 h-10 w-full px-3 text-[13.5px] outline-none focus:border-foreground/25 read-only:bg-muted/40 read-only:text-muted-foreground"
                />
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {!managedByOrganization ? (
                  <DashBtn onClick={() => void saveEmail()}>
                    {busy === "email" ? "Saving…" : "Update email"}
                  </DashBtn>
                ) : null}
                <DashBtn onClick={() => void sendReset()}>
                  {busy === "reset" ? "Sending…" : "Email reset link"}
                </DashBtn>
              </div>
          </div>
        ) : null}

        <div className="settings-glass-row flex items-center justify-between gap-4 px-4 py-4">
            <div>
              <p className="text-[13.5px] font-medium tracking-[-0.01em]">Log out</p>
              {!mobile ? (
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  Sign out on this device.
                </p>
              ) : null}
            </div>
            <DashBtn onClick={() => void logout()}>
              {busy === "logout" ? "Signing out…" : "Log out"}
            </DashBtn>
        </div>

        <div className="settings-glass-row flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium tracking-[-0.01em]">Delete account</p>
              {!mobile ? (
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  {deleteDescription()}
                </p>
              ) : null}
            </div>
            {managedByOrganization && !entitlements.isOwner ? (
              <span className="shrink-0 text-[12.5px] text-muted-foreground">
                Managed by your organization
              </span>
            ) : hasOtherOrgMembers ? (
              <span className="shrink-0 text-[12.5px] text-muted-foreground">
                Remove other users first
              </span>
            ) : confirmDelete ? (
              <div className="flex w-full max-w-sm flex-col gap-2 sm:items-end">
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                  placeholder='Type "delete" to confirm'
                  aria-label='Type "delete" to confirm account deletion'
                  className="settings-glass-input h-10 w-full px-3 text-[13.5px] outline-none focus:border-foreground/25"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy === "delete" || !deleteConfirmOk}
                    onClick={() => void removeAccount()}
                    className="inline-flex h-10 items-center rounded-[10px] border border-destructive/30 bg-destructive/10 px-4 text-[13.5px] font-medium tracking-[-0.01em] text-destructive hover:bg-destructive/15 disabled:opacity-50"
                  >
                    {busy === "delete" ? "Deleting…" : "Confirm delete"}
                  </button>
                  <DashBtn
                    onClick={() => {
                      setConfirmDelete(false);
                      setDeleteConfirmText("");
                    }}
                  >
                    Cancel
                  </DashBtn>
                </div>
              </div>
            ) : billingBlocksDelete ? (
              <button
                type="button"
                onClick={() =>
                  nativeShell
                    ? openExternalUrl(webAppPlansSettingsUrl())
                    : setSettingsTab("plans")
                }
                className="inline-flex h-10 shrink-0 items-center rounded-[10px] border border-foreground/15 px-4 text-[13.5px] font-medium tracking-[-0.01em] hover:bg-muted"
              >
                {nativeShell ? "Manage billing on web" : "Cancel plan"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex h-10 shrink-0 items-center rounded-[10px] border border-destructive/30 px-4 text-[13.5px] font-medium tracking-[-0.01em] text-destructive hover:bg-destructive/10"
              >
                Delete account
              </button>
            )}
        </div>

      </SettingsGroup>

      {message ? (
        <p className="px-1 text-[12.5px] text-muted-foreground">{message}</p>
      ) : null}
      {error ? (
        <p className="px-1 text-[12.5px] text-destructive">{error}</p>
      ) : null}
    </SettingsSection>
  );
}
