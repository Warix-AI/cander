"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import {
  connectors,
  currentUserId,
  members,
  workspaces as seedWorkspaces,
} from "@/lib/data";
import type { KnowledgeAccess, Workspace, WorkspaceSeatRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  addKnowledgeBase,
  ensurePolicy,
  knowledgeLabel,
  policyFor,
  removeKnowledgeBase,
  roleLabel,
  setMemberPolicy,
  toggleDisabledConnector,
} from "@/lib/workspace-policy";

export function WorkspacesSettings({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { workspacePolicies } = useApp();
  const [workspaceList, setWorkspaceList] = useState<Workspace[]>(seedWorkspaces);
  const [newName, setNewName] = useState("");
  const selected = workspaceList.find((item) => item.id === selectedId) ?? null;

  if (selected) {
    const policy = policyFor(selected.id, workspacePolicies);
    return (
      <WorkspacePage
        workspace={selected}
        policy={policy}
        onBack={() => onSelect(null)}
      />
    );
  }

  return (
    <>
      <h2
        id="settings-title"
        className="text-[18px] font-medium tracking-[-0.02em]"
      >
        Workspaces
      </h2>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
        Each workspace has its own knowledge, member permissions, and allowed
        connectors. Billing stays on the organization.
      </p>
      <form
        className="mt-6 flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const name = newName.trim();
          if (!name) return;
          const id = name.toLowerCase().replace(/\s+/g, "-");
          if (workspaceList.some((item) => item.id === id)) return;
          ensurePolicy(id, currentUserId);
          setWorkspaceList((current) => [
            ...current,
            {
              id,
              name,
              spaces: [
                "build",
                "studio",
                "research",
                "skills",
                "scheduled",
                "connectors",
              ],
              members: 1,
              budget: "$0",
              spend: "$0",
            },
          ]);
          setNewName("");
          onSelect(id);
        }}
      >
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New workspace name"
          className="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-card px-3 text-[13.5px] outline-none focus:border-foreground/20"
        />
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-[13.5px] font-medium tracking-[-0.01em] text-primary-foreground"
        >
          Add
        </button>
      </form>
      <div className="mt-6 max-w-xl">
        {workspaceList.map((item) => {
          const policy = policyFor(item.id, workspacePolicies);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className="flex w-full items-center justify-between gap-3 border-b border-border py-3.5 text-left transition-colors duration-200 hover:bg-muted/40"
            >
              <span>
                <span className="block text-[14px] tracking-[-0.01em]">
                  {item.name}
                </span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  {policy.knowledgeBases.length} knowledge bases ·{" "}
                  {policy.members.length || item.members} members ·{" "}
                  {policy.disabledConnectors.length} connectors disabled
                </span>
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground"
                strokeWidth={1.6}
              />
            </button>
          );
        })}
      </div>
    </>
  );
}

function WorkspacePage({
  workspace,
  policy,
  onBack,
}: {
  workspace: Workspace;
  policy: ReturnType<typeof policyFor>;
  onBack: () => void;
}) {
  const [kbName, setKbName] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.7} />
        Workspaces
      </button>
      <h2
        id="settings-title"
        className="mt-3 text-[18px] font-medium tracking-[-0.02em]"
      >
        {workspace.name}
      </h2>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
        Internal knowledge for this workspace, what each person can do, and
        which apps they are allowed to connect.
      </p>

      <section className="mt-8 max-w-2xl">
        <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
          Knowledge bases
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Sources Courier can use inside {workspace.name}. They stay on this
          workspace.
        </p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addKnowledgeBase(workspace.id, kbName);
            setKbName("");
          }}
        >
          <input
            value={kbName}
            onChange={(event) => setKbName(event.target.value)}
            placeholder="New knowledge base"
            className="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-card px-3 text-[13.5px] outline-none focus:border-foreground/20"
          />
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-full border border-foreground/15 px-4 text-[13.5px] font-medium tracking-[-0.01em] hover:bg-muted"
          >
            Add
          </button>
        </form>
        <div className="mt-2 rounded-[10px] border border-border">
          {policy.knowledgeBases.length ? (
            policy.knowledgeBases.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-[14px] tracking-[-0.01em]">{item.name}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {item.summary}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {item.sources} sources · {item.updatedAt}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeKnowledgeBase(workspace.id, item.id)}
                  className="shrink-0 text-[12.5px] text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <p className="px-4 py-4 text-[13px] text-muted-foreground">
              No knowledge bases yet.
            </p>
          )}
        </div>
      </section>

      <section className="mt-10 max-w-2xl">
        <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
          Permissions
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          What each person in this workspace can do with knowledge and the
          workspace itself.
        </p>
        <div className="mt-4 overflow-x-auto rounded-[10px] border border-border">
          <div className="grid grid-cols-[1fr_7.5rem_7.5rem] gap-2 border-b border-border px-4 py-2 font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase">
            <span>User</span>
            <span>Workspace</span>
            <span>Knowledge</span>
          </div>
          {policy.members.map((row) => {
            const member = members.find((item) => item.id === row.memberId);
            if (!member) return null;
            return (
              <div
                key={row.memberId}
                className="grid grid-cols-[1fr_7.5rem_7.5rem] items-center gap-2 border-b border-border px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px]">{member.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {member.email}
                  </p>
                </div>
                <Select
                  value={row.role}
                  onChange={(value) =>
                    setMemberPolicy(workspace.id, row.memberId, {
                      role: value as WorkspaceSeatRole,
                    })
                  }
                  options={(
                    ["admin", "member", "viewer"] as WorkspaceSeatRole[]
                  ).map((id) => ({ id, label: roleLabel[id] }))}
                />
                <Select
                  value={row.knowledge}
                  onChange={(value) =>
                    setMemberPolicy(workspace.id, row.memberId, {
                      knowledge: value as KnowledgeAccess,
                    })
                  }
                  options={(
                    ["manage", "use", "none"] as KnowledgeAccess[]
                  ).map((id) => ({ id, label: knowledgeLabel[id] }))}
                />
              </div>
            );
          })}
        </div>
        {!policy.members.length ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            No people assigned to this workspace yet.
          </p>
        ) : null}
      </section>

      <section className="mt-10 max-w-2xl pb-6">
        <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
          Connectors
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Disabled apps cannot be connected from {workspace.name}. They remain
          available in other workspaces.
        </p>
        <div className="mt-4 rounded-[10px] border border-border">
          {connectors.map((item) => {
            const disabled = policy.disabledConnectors.includes(item.id);
            return (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0",
                  disabled && "opacity-55",
                )}
              >
                <ConnectorMark id={item.icon} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] tracking-[-0.01em]">{item.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {item.category}
                    {disabled ? " · Disabled in this workspace" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleDisabledConnector(workspace.id, item.id)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[12px] font-medium tracking-[-0.01em]",
                    disabled
                      ? "border border-foreground/15 hover:bg-muted"
                      : "bg-primary text-primary-foreground hover:bg-foreground",
                  )}
                >
                  {disabled ? "Enable" : "Disable"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full rounded-[10px] border border-border bg-background px-2 text-[12.5px] outline-none focus:border-foreground/20"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
