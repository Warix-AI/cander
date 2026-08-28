"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";
import type { WorkspaceInvite } from "@/lib/workspace-membership";
import {
  replacePendingInvites,
  removePendingInvite,
} from "@/lib/workspace-invites-store";
import { hydrateMemberFromSupabase } from "@/lib/supabase/hydrate-member";

async function authToken() {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function fetchPendingWorkspaceInvites(): Promise<WorkspaceInvite[]> {
  if (!isSupabaseConfigured()) return [];
  const token = await authToken();
  if (!token) return [];

  const response = await fetch("/api/workspace/invites/pending", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return [];
  const data = await response.json();
  const invites = Array.isArray(data.invites)
    ? (data.invites as WorkspaceInvite[])
    : [];
  replacePendingInvites(invites);
  return invites;
}

export async function sendWorkspaceInvite(input: {
  workspaceId: string;
  email: string;
  orgId?: string | null;
}) {
  if (!isSupabaseConfigured()) return { ok: true as const };
  const token = await authToken();
  if (!token) throw new Error("Sign in to send invites.");

  const response = await fetch("/api/workspace/invites/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Could not send workspace invite.");
  }
  return data as { ok: true; inviteId: string };
}

export async function acceptWorkspaceInvite(inviteId: string) {
  if (!isSupabaseConfigured()) return null;
  const token = await authToken();
  if (!token) throw new Error("Sign in to accept invite.");

  const response = await fetch(`/api/workspace/invites/${inviteId}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Could not accept invite.");
  }

  removePendingInvite(inviteId);

  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await hydrateMemberFromSupabase(user);
  }

  return data.workspaceId as string;
}

export async function declineWorkspaceInvite(inviteId: string) {
  if (!isSupabaseConfigured()) return;
  const token = await authToken();
  if (!token) throw new Error("Sign in to decline invite.");

  const response = await fetch(`/api/workspace/invites/${inviteId}/decline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Could not decline invite.");
  }
  removePendingInvite(inviteId);
}

export async function revokeWorkspaceInvite(input: {
  workspaceId: string;
  email: string;
  orgId?: string | null;
}) {
  if (!isSupabaseConfigured()) return;
  const token = await authToken();
  if (!token) throw new Error("Sign in to revoke invite.");

  const response = await fetch("/api/workspace/invites/revoke", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Could not revoke workspace invite.");
  }
}
