"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { MemberPlanToggle } from "@/components/settings/MemberPlanToggle";
import { settingsInputClass } from "@/components/settings/SettingsChrome";
import { Modal } from "@/components/ui/Modal";
import { emptyOrgInvite, type OrgInviteDraft } from "@/lib/org-onboarding";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  orgId: string;
  workspaceIds: string[];
  ownerEmail: string;
  onInvited?: (message: string | null, warning?: string | null) => void;
};

export function OrgInviteModal({
  open,
  onClose,
  orgId,
  workspaceIds,
  ownerEmail,
  onInvited,
}: Props) {
  const [draft, setDraft] = useState<OrgInviteDraft>(emptyOrgInvite());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setDraft(emptyOrgInvite());
    setError(null);
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const email = draft.email.trim().toLowerCase();
    if (!email.includes("@")) {
      setError("Add a valid email address.");
      return;
    }
    if (email === ownerEmail.trim().toLowerCase()) {
      setError("You cannot invite yourself.");
      return;
    }

    if (!isSupabaseConfigured()) {
      onInvited?.("Invites saved locally — connect Supabase to send email.");
      handleClose();
      return;
    }

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Sign in to send invites.");
      }

      const response = await fetch("/api/org/invites/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          orgId,
          workspaceIds,
          invites: [draft],
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not send invite.");
      }

      const results = Array.isArray(data.results)
        ? (data.results as { email: string; inviteUrl: string; sent: boolean }[])
        : [];
      const row = results[0];
      if (row && !row.sent) {
        onInvited?.(
          `Invite saved — share link: ${row.inviteUrl}`,
          null,
        );
      } else {
        onInvited?.(`Invite sent to ${email}.`, null);
      }
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send invite.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      labelledBy="org-invite-title"
      className="w-full max-w-[24rem]"
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <h2
            id="org-invite-title"
            className="text-[16px] font-semibold tracking-[-0.03em]"
          >
            Invite teammate
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Billing prorates on the owner&apos;s subscription when they accept.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={handleClose}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground",
            SHELL_G3_RADIUS,
          )}
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </div>

      <form className="space-y-4 px-5 pb-5" onSubmit={(event) => void submit(event)}>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={draft.firstName}
            onChange={(event) =>
              setDraft((current) => ({ ...current, firstName: event.target.value }))
            }
            placeholder="First name"
            aria-label="First name"
            className={settingsInputClass}
          />
          <input
            value={draft.lastName}
            onChange={(event) =>
              setDraft((current) => ({ ...current, lastName: event.target.value }))
            }
            placeholder="Last name"
            aria-label="Last name"
            className={settingsInputClass}
          />
        </div>
        <input
          type="email"
          value={draft.email}
          onChange={(event) =>
            setDraft((current) => ({ ...current, email: event.target.value }))
          }
          placeholder="Email"
          aria-label="Email"
          className={settingsInputClass}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-muted-foreground">Seat plan</p>
          <MemberPlanToggle
            value={draft.plan}
            label="Invite seat plan"
            onChange={(plan) => setDraft((current) => ({ ...current, plan }))}
          />
        </div>

        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-10 items-center rounded-full border border-foreground/15 px-4 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-[13px] font-medium tracking-[-0.01em] text-primary-foreground disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
