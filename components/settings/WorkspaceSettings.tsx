"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { connectors, spaces as spaceCatalog, workspaces as seedWorkspaces } from "@/lib/data";
import { NAV_SPACES } from "@/lib/spaces";
import type { KnowledgeBase, Workspace } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  addKnowledgeBase,
  addKnowledgeFile,
  ensurePolicy,
  fileSizeLabel,
  memberSpaces,
  policyFor,
  removeKnowledgeBase,
  removeKnowledgeFile,
  toggleDisabledConnector,
  toggleMemberSpace,
} from "@/lib/workspace-policy";

export function WorkspacesSettings({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { workspacePolicies, orgMembers, entitlements, personalSpaceEnabled, setPersonalSpaceEnabled } = useApp();
  const [workspaceList, setWorkspaceList] = useState<Workspace[]>(
    seedWorkspaces.filter((item) => !item.personal),
  );
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

  const atCap = workspaceList.length >= entitlements.workspaceCap;

  return (
    <>
      <h2
        id="settings-title"
        className="text-[18px] font-medium tracking-[-0.02em]"
      >
        Workspaces
      </h2>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
        Knowledge bases live on the workspace. People assigned from Organization
        inherit them. Permissions here only toggle which spaces they can open.
      </p>
      {entitlements.canManageWorkspaces ? (
        <div className="mt-6 flex max-w-xl items-start justify-between gap-4 rounded-[10px] border border-border p-4">
          <div>
            <p className="text-[13.5px]">Allow Personal space</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
              Organization setting — show Personal next to Research.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={personalSpaceEnabled}
            onClick={() => setPersonalSpaceEnabled(!personalSpaceEnabled)}
            className="inline-flex h-8 shrink-0 items-center rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted"
          >
            {personalSpaceEnabled ? "On" : "Off"}
          </button>
        </div>
      ) : null}
      {entitlements.hasWorkspaces ? (
        <>
      <form
        className="mt-6 flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const name = newName.trim();
          if (!name) return;
          if (workspaceList.length >= entitlements.workspaceCap) return;
          const id = name.toLowerCase().replace(/\s+/g, "-");
          if (workspaceList.some((item) => item.id === id)) return;
          ensurePolicy(id, orgMembers[0]?.id);
          setWorkspaceList((current) => [
            ...current,
            {
              id,
              name,
              spaces: [...NAV_SPACES],
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
          disabled={atCap}
          className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-[13.5px] font-medium tracking-[-0.01em] text-primary-foreground disabled:opacity-40"
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
                  {policy.knowledgeBases.length} knowledge bases
                  {entitlements.canManageMembers
                    ? ` · ${policy.members.length} people`
                    : ""}
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
      ) : null}
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
  const { orgMembers, workspacePolicies, entitlements } = useApp();
  const [kbName, setKbName] = useState("");
  const [openUser, setOpenUser] = useState<string | null>(
    policy.members[0]?.memberId ?? null,
  );

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
        Assigned people get these knowledge bases. Toggle spaces to control what
        they can open — role stays on Organization.
      </p>

      <section className="mt-8 max-w-2xl">
        <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
          Knowledge bases
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {entitlements.hasWorkspaceKnowledge
            ? `Sources Courier can use inside ${workspace.name}.`
            : "Knowledge bases start on Pro."}
        </p>
        {entitlements.hasWorkspaceKnowledge ? (
          <>
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
            <div className="mt-4 space-y-3">
              {policy.knowledgeBases.length ? (
                policy.knowledgeBases.map((item) => (
                  <KnowledgeCard
                    key={item.id}
                    workspaceId={workspace.id}
                    item={item}
                  />
                ))
              ) : (
                <p className="rounded-[10px] border border-border px-4 py-4 text-[13px] text-muted-foreground">
                  No knowledge bases yet.
                </p>
              )}
            </div>
          </>
        ) : null}
      </section>

      {entitlements.hasConnectorPolicies ? (
        <section className="mt-10 max-w-2xl">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            Connector policies
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Turn a connector off for this workspace. Installed apps stay in
            Courier; they just can’t run here.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {connectors
              .filter(
                (item) =>
                  item.installed ||
                  policy.disabledConnectors.includes(item.id),
              )
              .map((item) => {
                const off = policy.disabledConnectors.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleDisabledConnector(workspace.id, item.id)}
                    className={cn(
                      "inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium tracking-[-0.01em] transition-colors duration-200",
                      off
                        ? "border border-foreground/15 text-muted-foreground hover:text-foreground"
                        : "bg-primary text-primary-foreground",
                    )}
                  >
                    {item.name}
                    {off ? " · off" : ""}
                  </button>
                );
              })}
          </div>
        </section>
      ) : null}

      {entitlements.canManageWorkspaces ? (
      <section className="mt-10 max-w-2xl pb-6">
        <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
          Permissions
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Click a person to turn spaces on or off. Role is not set here.
        </p>
        <div className="mt-4 rounded-[10px] border border-border">
          {policy.members.map((row) => {
            const member = orgMembers.find((item) => item.id === row.memberId);
            if (!member) return null;
            const open = openUser === row.memberId;
            const enabled = memberSpaces(
              workspace.id,
              row.memberId,
              workspacePolicies,
            );
            return (
              <div
                key={row.memberId}
                className="border-b border-border last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenUser((current) =>
                      current === row.memberId ? null : row.memberId,
                    )
                  }
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-muted/50"
                >
                  <span>
                    <span className="block text-[13.5px]">{member.name}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {member.email} · {enabled.length} of {workspace.spaces.length}{" "}
                      spaces
                    </span>
                  </span>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      open && "rotate-90",
                    )}
                    strokeWidth={1.6}
                  />
                </button>
                {open ? (
                  <div className="flex flex-wrap gap-1.5 px-4 pb-4">
                    {workspace.spaces
                      .filter(
                        (spaceId) =>
                          spaceId !== "work" || entitlements.canUseWorkSpace,
                      )
                      .map((spaceId) => {
                      const on = row.spaces.includes(spaceId);
                      const space = spaceCatalog.find((item) => item.id === spaceId);
                      return (
                        <button
                          key={spaceId}
                          type="button"
                          onClick={() =>
                            toggleMemberSpace(workspace.id, row.memberId, spaceId)
                          }
                          className={cn(
                            "inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium tracking-[-0.01em] transition-colors duration-200",
                            on
                              ? "bg-primary text-primary-foreground"
                              : "border border-foreground/15 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {space?.label ?? spaceId}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
          {!policy.members.length ? (
            <p className="px-4 py-4 text-[13px] text-muted-foreground">
              Assign people to this workspace from Organization.
            </p>
          ) : null}
        </div>
      </section>
      ) : null}
    </>
  );
}

function KnowledgeCard({
  workspaceId,
  item,
}: {
  workspaceId: string;
  item: KnowledgeBase;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-[10px] border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] tracking-[-0.01em]">{item.name}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {item.summary}
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {item.files.length} files · {item.sources} sources · {item.updatedAt}
          </p>
        </div>
        <button
          type="button"
          onClick={() => removeKnowledgeBase(workspaceId, item.id)}
          className="shrink-0 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          Remove
        </button>
      </div>

      <div className="mt-3 rounded-[10px] border border-border/80">
        {item.files.length ? (
          item.files.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px]">{entry.name}</p>
                <p className="font-mono text-[10.5px] text-muted-foreground">
                  {entry.size} · {entry.uploadedAt}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  removeKnowledgeFile(workspaceId, item.id, entry.id)
                }
                className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground"
              >
                Remove
              </button>
            </div>
          ))
        ) : (
          <p className="px-3 py-2.5 text-[12.5px] text-muted-foreground">
            No files yet.
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            files.forEach((file) => {
              addKnowledgeFile(workspaceId, item.id, {
                name: file.name,
                size: fileSizeLabel(file.size),
              });
            });
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/15 px-3 text-[12px] font-medium tracking-[-0.01em] hover:bg-muted"
        >
          <Upload className="h-3.5 w-3.5" strokeWidth={1.6} />
          Upload
        </button>
        <p className="text-[12px] text-muted-foreground">
          PDFs, docs, and text files stay on this workspace.
        </p>
      </div>
    </div>
  );
}
