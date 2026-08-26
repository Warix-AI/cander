"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Plus,
  Upload,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
  settingsInputClass,
} from "@/components/settings/SettingsChrome";
import { WorkspaceMark } from "@/components/shell/WorkspaceMark";
import { workspacesFor } from "@/lib/entitlements";
import { connectors, spaces as spaceCatalog } from "@/lib/data";
import type { KnowledgeBase, Workspace } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  isCustomWorkspace,
  subscribeWorkspaceCatalog,
} from "@/lib/workspace-catalog";
import {
  workspaceKindLabel,
  workspaceKindOf,
} from "@/lib/workspace-kind";
import {
  clearWorkspaceIcon,
  getWorkspaceIconsServerSnapshot,
  getWorkspaceIconsSnapshot,
  readWorkspaceIconFile,
  setWorkspaceIcon,
  subscribeWorkspaceIcons,
  workspaceIconFor,
} from "@/lib/workspace-icons";
import {
  addKnowledgeBase,
  addKnowledgeFile,
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
  const {
    workspacePolicies,
    entitlements,
    personalSpaceEnabled,
    setPersonalSpaceEnabled,
    actor,
    openOverlay,
  } = useApp();
  useSyncExternalStore(
    subscribeWorkspaceCatalog,
    getWorkspaceCatalogSnapshot,
    getWorkspaceCatalogServerSnapshot,
  );
  const workspaceList = workspacesFor(actor, entitlements);
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

  const canCreate =
    entitlements.canCreatePersonalWorkspace ||
    entitlements.canCreateBusinessWorkspace;

  return (
    <SettingsPage>
      <SettingsHeader
        title="Workspaces"
        actions={
          canCreate ? (
            <button
              type="button"
              aria-label="Create workspace"
              onClick={() => openOverlay("workspace")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 text-foreground hover:bg-muted max-lg:hidden"
            >
              <Plus className="h-4 w-4" strokeWidth={1.8} />
            </button>
          ) : null
        }
      />

      {entitlements.canManageWorkspaces ? (
        <SettingsSection
          title="Organization defaults"
          description="Applies across business workspaces for this organization."
          className="mt-8"
        >
          <SettingsGroup>
            <SettingsRow
              label="Allow Personal space"
              description="Let members open Personal from search and pins — not in primary navigation."
            >
              <button
                type="button"
                role="switch"
                aria-checked={personalSpaceEnabled}
                onClick={() => setPersonalSpaceEnabled(!personalSpaceEnabled)}
                className="inline-flex h-8 shrink-0 items-center rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted"
              >
                {personalSpaceEnabled ? "On" : "Off"}
              </button>
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>
      ) : null}

      {entitlements.hasWorkspaces || canCreate ? (
        <SettingsSection
          title="Your workspaces"
          description="Open a workspace to manage people, connectors, and knowledge."
          className={entitlements.canManageWorkspaces ? undefined : "mt-8"}
        >
          <SettingsGroup dividerInset="icon">
            {workspaceList.map((item) => {
              const policy = policyFor(item.id, workspacePolicies);
              const kind = workspaceKindOf(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-muted/50"
                >
                  <WorkspaceMark id={item.id} name={item.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium tracking-[-0.01em]">
                      {item.name}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                      {workspaceKindLabel(kind)} ·{" "}
                      {policy.members.length === 1
                        ? "1 person"
                        : `${policy.members.length} people`}
                    </span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.6}
                  />
                </button>
              );
            })}
          </SettingsGroup>
        </SettingsSection>
      ) : null}
    </SettingsPage>
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
  const { orgMembers, workspacePolicies, entitlements, removeWorkspace } =
    useApp();
  const [kbName, setKbName] = useState("");
  const [openUser, setOpenUser] = useState<string | null>(
    policy.members[0]?.memberId ?? null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canDelete =
    isCustomWorkspace(workspace.id) &&
    (workspaceKindOf(workspace) === "personal" ||
      entitlements.canManageWorkspaces);

  const handleDelete = () => {
    setDeleteError(null);
    const ok = removeWorkspace(workspace.id);
    if (!ok) {
      setDeleteError("Could not delete this workspace.");
      return;
    }
    onBack();
  };

  return (
    <SettingsPage>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors duration-200 hover:text-foreground max-lg:hidden"
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.7} />
        Workspaces
      </button>
      <SettingsHeader
        kicker={workspaceKindLabel(workspaceKindOf(workspace))}
        title={workspace.name}
        subtitle={
          workspaceKindOf(workspace) === "personal"
            ? "Friends and family share chats, files, and projects here. Roles stay simple: Owner and Member. Company emails can’t join."
            : "Assigned people get these knowledge bases. Toggle spaces to control what they can open — organization roles and seats still apply. Personal emails can’t join."
        }
      />

      <div className="mt-8 max-lg:mt-4">
        <WorkspaceIconSection workspace={workspace} />
      </div>

      <SettingsSection
        title="Knowledge bases"
        description={
          entitlements.hasWorkspaceKnowledge
            ? `Sources the app can use inside ${workspace.name}.`
            : "Knowledge bases start on Pro."
        }
      >
        {entitlements.hasWorkspaceKnowledge ? (
          <>
            <form
              className="mb-3 flex max-w-xl gap-2"
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
                className={cn(settingsInputClass, "min-w-0 flex-1")}
              />
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-full border border-foreground/15 px-4 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted"
              >
                Add
              </button>
            </form>
            <div className="space-y-3">
              {policy.knowledgeBases.length ? (
                policy.knowledgeBases.map((item) => (
                  <KnowledgeCard
                    key={item.id}
                    workspaceId={workspace.id}
                    item={item}
                  />
                ))
              ) : (
                <SettingsGroup>
                  <div className="px-4 py-4 text-[13px] text-muted-foreground">
                    No knowledge bases yet.
                  </div>
                </SettingsGroup>
              )}
            </div>
          </>
        ) : null}
      </SettingsSection>

      {entitlements.hasConnectorPolicies ? (
        <SettingsSection
          title="Connector policies"
          description="Turn a connector off for this workspace. Installed apps stay in the app; they just can’t run here."
        >
          <div className="flex flex-wrap gap-1.5">
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
                    onClick={() =>
                      toggleDisabledConnector(workspace.id, item.id)
                    }
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
        </SettingsSection>
      ) : null}

      {entitlements.canManageWorkspaces ? (
        <SettingsSection
          title="Permissions"
          description="Click a person to turn spaces on or off. Role is not set here."
        >
          <SettingsGroup>
            {policy.members.map((row) => {
              const member = orgMembers.find(
                (item) => item.id === row.memberId,
              );
              if (!member) return null;
              const open = openUser === row.memberId;
              const enabled = memberSpaces(
                workspace.id,
                row.memberId,
                workspacePolicies,
              );
              return (
                <div key={row.memberId}>
                  <SettingsRow
                    label={member.name}
                    description={`${member.email} · ${enabled.length} of ${workspace.spaces.length} spaces`}
                    onClick={() =>
                      setOpenUser((current) =>
                        current === row.memberId ? null : row.memberId,
                      )
                    }
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        open && "rotate-90",
                      )}
                      strokeWidth={1.6}
                    />
                  </SettingsRow>
                  {open ? (
                    <div className="flex flex-wrap gap-1.5 px-4 pb-3.5">
                      {workspace.spaces
                        .filter(
                          (spaceId) =>
                            spaceId !== "work" || entitlements.canUseWorkSpace,
                        )
                        .map((spaceId) => {
                          const on = row.spaces.includes(spaceId);
                          const space = spaceCatalog.find(
                            (item) => item.id === spaceId,
                          );
                          return (
                            <button
                              key={spaceId}
                              type="button"
                              onClick={() =>
                                toggleMemberSpace(
                                  workspace.id,
                                  row.memberId,
                                  spaceId,
                                )
                              }
                              className={cn(
                                "inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-medium tracking-[-0.01em] transition-colors duration-200",
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
              <div className="px-4 py-4 text-[13px] text-muted-foreground">
                Assign people to this workspace from Organization.
              </div>
            ) : null}
          </SettingsGroup>
        </SettingsSection>
      ) : null}

      {canDelete ? (
        <SettingsSection
          title="Delete workspace"
          description="Removes this workspace from your account. Built-in demo workspaces cannot be deleted."
          className="mt-8"
        >
          <SettingsGroup>
            <div className="px-4 py-4">
              {confirmDelete ? (
                <div className="space-y-3">
                  <p className="text-[13px] text-muted-foreground">
                    Delete{" "}
                    <span className="font-medium text-foreground">
                      {workspace.name}
                    </span>
                    ? This cannot be undone.
                  </p>
                  {deleteError ? (
                    <p className="text-[12.5px] text-destructive">{deleteError}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="inline-flex h-9 items-center rounded-full bg-destructive px-4 text-[13px] font-medium tracking-[-0.01em] text-destructive-foreground"
                    >
                      Delete workspace
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDelete(false);
                        setDeleteError(null);
                      }}
                      className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex h-9 items-center rounded-full border border-destructive/30 px-4 text-[13px] font-medium tracking-[-0.01em] text-destructive transition-colors duration-200 hover:bg-destructive/10"
                >
                  Delete workspace
                </button>
              )}
            </div>
          </SettingsGroup>
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}

function WorkspaceIconSection({ workspace }: { workspace: Workspace }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const icons = useSyncExternalStore(
    subscribeWorkspaceIcons,
    getWorkspaceIconsSnapshot,
    getWorkspaceIconsServerSnapshot,
  );
  const icon = workspaceIconFor(workspace.id, icons);

  return (
    <SettingsSection title="Icon" description="Shown in the workspace rail. Initials are used when no image is set." className="mt-0">
      <SettingsGroup>
        <div className="flex items-center gap-4 px-4 py-4">
          <WorkspaceMark id={workspace.id} name={workspace.name} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                input.current?.click();
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted"
            >
              <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.6} />
              {icon ? "Replace" : "Upload"}
            </button>
            {icon ? (
              <button
                type="button"
                onClick={() => {
                  clearWorkspaceIcon(workspace.id);
                  setError(null);
                }}
                className="inline-flex h-8 items-center rounded-full px-3 text-[12.5px] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
        {error ? (
          <p className="px-4 pb-3 text-[12.5px] text-destructive">{error}</p>
        ) : null}
      </SettingsGroup>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void readWorkspaceIconFile(file)
            .then((dataUrl) => {
              setWorkspaceIcon(workspace.id, dataUrl);
              setError(null);
            })
            .catch((err: unknown) => {
              setError(
                err instanceof Error ? err.message : "Could not upload image.",
              );
            });
        }}
      />
    </SettingsSection>
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
    <div className="rounded-[10px] border border-border bg-card p-4">
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

      <div className="mt-3 overflow-hidden rounded-[10px] border border-border/80 [&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:top-0 [&>*+*]:before:right-0 [&>*+*]:before:left-3 [&>*+*]:before:h-px [&>*+*]:before:bg-border">
        {item.files.length ? (
          item.files.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
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
