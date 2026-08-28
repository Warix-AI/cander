"use client";

import type { WorkspaceInvite } from "@/lib/workspace-membership";

type Listener = () => void;

const listeners = new Set<Listener>();
let pendingInvites: WorkspaceInvite[] = [];

function emit() {
  listeners.forEach((listener) => listener());
}

export function getPendingInvitesSnapshot(): WorkspaceInvite[] {
  return pendingInvites;
}

export function getPendingInvitesServerSnapshot(): WorkspaceInvite[] {
  return [];
}

export function subscribePendingInvites(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function replacePendingInvites(next: WorkspaceInvite[]) {
  pendingInvites = next;
  emit();
}

export function removePendingInvite(id: string) {
  pendingInvites = pendingInvites.filter((item) => item.id !== id);
  emit();
}
