"use client";

import { useState, type FormEvent } from "react";
import { MemberPlanToggle } from "@/components/settings/MemberPlanToggle";
import {
  SettingsGroup,
  settingsInputClass,
} from "@/components/settings/SettingsChrome";
import { emptyOrgInvite, type OrgInviteDraft } from "@/lib/org-onboarding";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Props = {
  orgId: string;
  workspaceIds: string[];
  ownerEmail: string;
  onInvited?: () => void;
};

function validRows(rows: OrgInviteDraft[]) {
  return rows.filter((row) => row.email.trim().includes("@"));
}

export function OrgTeammateInvitePanel({
  orgId,
  workspaceIds,
  ownerEmail,
  onInvited,
}: Props) {
  const [rows, setRows] = useState<OrgInviteDraft[]>([emptyOrgInvite()]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const updateRow = (index: number, patch: Partial<OrgInviteDraft>) => {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const addRow = () => {
    setRows((current) => [...current, emptyOrgInvite()]);
  };

  const removeRow = (index: number) => {
    setRows((current) =>
      current.length <= 1 ? [emptyOrgInvite()] : current.filter((_, i) => i !== index),
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const invites = validRows(rows);
    if (!invites.length) {
      setError("Add at least one teammate email.");
      return;
    }

    const self = ownerEmail.trim().toLowerCase();
    for (const row of invites) {
      if (row.email.trim().toLowerCase() === self) {
        setError("You cannot invite yourself.");
        return;
      }
    }

    if (!isSupabaseConfigured()) {
      setMessage("Invites saved locally — connect Supabase to send email.");
      onInvited?.();
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
        body: JSON.stringify({ orgId, workspaceIds, invites }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not send invites.");
      }

      setRows([emptyOrgInvite()]);
      const results = Array.isArray(data.results)
        ? (data.results as { email: string; inviteUrl: string; sent: boolean }[])
        : [];
      const sentCount = results.filter((row) => row.sent).length;
      const unsent = results.filter((row) => !row.sent);
      if (unsent.length && !sentCount) {
        setMessage(
          `Invites saved, but email was not sent. Share: ${unsent
            .map((row) => `${row.email} → ${row.inviteUrl}`)
            .join(" · ")}`,
        );
      } else if (unsent.length) {
        setMessage(
          `${sentCount} emailed. ${unsent.length} saved without email — share: ${unsent
            .map((row) => `${row.email} → ${row.inviteUrl}`)
            .join(" · ")}`,
        );
      } else {
        setMessage(
          invites.length === 1
            ? `Invite sent to ${invites[0]!.email.trim()}.`
            : `${invites.length} invites sent.`,
        );
      }
      onInvited?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send invites.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsGroup>
      <form className="space-y-4 px-4 py-4" onSubmit={(event) => void submit(event)}>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Invite Pro or Max teammates. Billing prorates on your organization
          subscription when they accept.
        </p>

        <div className="space-y-2.5">
          {rows.map((row, index) => (
            <div
              key={index}
              className="space-y-2 rounded-[10px] border border-border bg-background/60 p-3"
            >
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={row.firstName}
                  onChange={(event) =>
                    updateRow(index, { firstName: event.target.value })
                  }
                  placeholder="First name"
                  aria-label={`First name ${index + 1}`}
                  className={settingsInputClass}
                />
                <input
                  value={row.lastName}
                  onChange={(event) =>
                    updateRow(index, { lastName: event.target.value })
                  }
                  placeholder="Last name"
                  aria-label={`Last name ${index + 1}`}
                  className={settingsInputClass}
                />
              </div>
              <input
                type="email"
                value={row.email}
                onChange={(event) => updateRow(index, { email: event.target.value })}
                placeholder="Email"
                aria-label={`Email ${index + 1}`}
                className={settingsInputClass}
              />
              <div className="flex items-center justify-between gap-3">
                <MemberPlanToggle
                  value={row.plan}
                  label={`Plan for invite ${index + 1}`}
                  onChange={(plan) => updateRow(index, { plan })}
                />
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="text-[12.5px] text-muted-foreground hover:text-foreground"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addRow}
            className={cn(
              "inline-flex h-9 items-center rounded-full border border-foreground/15 px-4 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted",
            )}
          >
            Add another
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-9 items-center rounded-full border border-foreground/15 px-4 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send invites"}
          </button>
        </div>

        {message ? (
          <p className="text-[12.5px] text-muted-foreground">{message}</p>
        ) : null}
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
      </form>
    </SettingsGroup>
  );
}
