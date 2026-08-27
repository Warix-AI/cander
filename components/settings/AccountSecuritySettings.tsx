"use client";

import { useState, useSyncExternalStore } from "react";
import { useApp } from "@/components/app/AppProvider";
import { DashBtn } from "@/components/spaces/ItemSet";
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/SettingsChrome";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { signOutAccount, clearLocalAuthState } from "@/lib/auth/sign-out";
import {
  deleteAccount,
  requestPasswordReset,
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
  const { entitlements, actor, setSettingsTab } = useApp();
  const supabase = isSupabaseConfigured();
  const user = useSyncExternalStore(
    subscribeSupabaseUser,
    getSupabaseUserSnapshot,
    getSupabaseUserServerSnapshot,
  );
  const currentEmail = authEmail(user);

  const [email, setEmail] = useState(currentEmail);
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
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }
      if (password !== passwordConfirm) {
        throw new Error("Passwords do not match.");
      }
      await updatePassword(password);
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
    if (!entitlements.canDeleteAccount && actor.kind === "org" && actor.role !== "Owner") {
      return "Your seat is managed by your organization. Contact an admin to leave.";
    }
    if (billingBlocksDelete) {
      if (isPaidPlan(actor.plan) && !actor.cancelAtPeriodEnd) {
        return "Cancel your plan first. Billing runs through the end of your current period.";
      }
      if (periodLabel) {
        return `Your plan stays active until ${periodLabel}. You can delete your account after billing ends.`;
      }
      return "Cancel your plan before deleting your account.";
    }
    if (supabase) {
      return "Permanently deletes your Auth user and cascaded profile data.";
    }
    return "Clears local session data for this browser.";
  };

  const body = (
    <>
      {supabase ? (
        <>
          <SettingsRow
            label="Email"
            description={
              mobile
                ? undefined
                : "Change email — confirm via the link we send to the new address."
            }
          >
            <div className="flex w-full max-w-sm flex-col gap-2 sm:items-end">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13.5px] outline-none focus:border-foreground/20"
              />
              <DashBtn onClick={() => void saveEmail()}>
                {busy === "email" ? "Saving…" : "Update email"}
              </DashBtn>
            </div>
          </SettingsRow>

          <SettingsRow
            label="Password"
            description={
              mobile ? undefined : "Set a new password while signed in."
            }
          >
            <div className="flex w-full max-w-sm flex-col gap-2 sm:items-end">
              <input
                type="password"
                autoComplete="new-password"
                placeholder="New password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13.5px] outline-none focus:border-foreground/20"
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13.5px] outline-none focus:border-foreground/20"
              />
              <div className="flex flex-wrap gap-2">
                <DashBtn onClick={() => void savePassword()}>
                  {busy === "password" ? "Saving…" : "Update password"}
                </DashBtn>
                <DashBtn onClick={() => void sendReset()}>
                  {busy === "reset" ? "Sending…" : "Email reset link"}
                </DashBtn>
              </div>
            </div>
          </SettingsRow>
        </>
      ) : null}

      <SettingsRow
        label="Log out"
        description={mobile ? undefined : "Sign out on this device."}
      >
        <DashBtn onClick={() => void logout()}>
          {busy === "logout" ? "Signing out…" : "Log out"}
        </DashBtn>
      </SettingsRow>

      <SettingsRow
        label="Delete account"
        description={mobile ? undefined : deleteDescription()}
      >
        {!entitlements.canDeleteAccount ? (
          <span className="text-[12.5px] text-muted-foreground">
            {actor.kind === "org" && actor.role !== "Owner"
              ? "Managed by your organization"
              : billingBlocksDelete && isPaidPlan(actor.plan) && !actor.cancelAtPeriodEnd
                ? "Cancel plan first"
                : billingBlocksDelete && periodLabel
                  ? `Active until ${periodLabel}`
                  : "Unavailable"}
          </span>
        ) : confirmDelete ? (
          <div className="flex w-full max-w-sm flex-col gap-2 sm:items-end">
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              placeholder='Type "delete" to confirm'
              aria-label='Type "delete" to confirm account deletion'
              className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13.5px] outline-none focus:border-foreground/20"
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
            className="inline-flex h-10 items-center rounded-[10px] border border-foreground/15 px-4 text-[13.5px] font-medium tracking-[-0.01em] hover:bg-muted"
          >
            {nativeShell ? "Manage billing on web" : "Cancel plan"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex h-10 items-center rounded-[10px] border border-destructive/30 px-4 text-[13.5px] font-medium tracking-[-0.01em] text-destructive hover:bg-destructive/10"
          >
            Delete account
          </button>
        )}
      </SettingsRow>

      {message ? (
        <p className="px-4 pb-3 text-[12.5px] text-muted-foreground">{message}</p>
      ) : null}
      {error ? (
        <p className="px-4 pb-3 text-[12.5px] text-destructive">{error}</p>
      ) : null}
    </>
  );

  if (mobile) {
    return (
      <SettingsSection title="Account">
        <SettingsGroup>{body}</SettingsGroup>
      </SettingsSection>
    );
  }

  return <SettingsGroup title="Account">{body}</SettingsGroup>;
}
