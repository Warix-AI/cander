"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ChevronRight,
  Plus,
  Upload,
} from "lucide-react";
import {
  CONNECTOR_CONTROL_RADIUS,
  SHELL_G3_RADIUS,
} from "@/lib/shell-chrome";
import { useApp } from "@/components/app/AppProvider";
import {
  SettingsFootnote,
  SettingsGroup,
  SettingsHeader,
  SettingsLinkRow,
  SettingsPage,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
  settingsInputClass,
} from "@/components/settings/SettingsChrome";
import { WorkspaceMark } from "@/components/shell/WorkspaceMark";
import { workspacesFor } from "@/lib/entitlements";
import { connectors } from "@/lib/data";
import type { KnowledgeBase, Workspace } from "@/lib/types";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import {
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  isCustomWorkspace,
  subscribeWorkspaceCatalog,
} from "@/lib/workspace-catalog";
import {
  deleteWorkspaceRemote,
} from "@/lib/supabase/workspace-actions";
import {
  workspaceKindOf,
} from "@/lib/workspace-kind";
import {
  addKnowledgeBase,
  addKnowledgeFile,
  fileSizeLabel,
  policyFor,
  removeKnowledgeBase,
  removeKnowledgeFile,
  toggleDisabledConnector,
} from "@/lib/workspace-policy";
import { extractKnowledgeFileText } from "@/lib/knowledge/extract-text";
import {
  removeKnowledgeFileFromSupabase,
  uploadKnowledgeFile,
} from "@/lib/api/knowledge-files";
import {
  acceptWorkspaceInvite,
  declineWorkspaceInvite,
  fetchPendingWorkspaceInvites,
  sendWorkspaceInvite,
} from "@/lib/api/workspace-invite-client";
import {
  getPendingInvitesServerSnapshot,
  getPendingInvitesSnapshot,
  subscribePendingInvites,
} from "@/lib/workspace-invites-store";
import type { WorkspaceInvite } from "@/lib/workspace-membership";

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
    actor,
    openOverlay,
  } = useApp();
  const mobile = useMobileShell();
  useSyncExternalStore(
    subscribeWorkspaceCatalog,
    getWorkspaceCatalogSnapshot,
    getWorkspaceCatalogServerSnapshot,
  );
  const workspaceList = workspacesFor(actor, entitlements);
  const selected = workspaceList.find((item) => item.id === selectedId) ?? null;
  const pendingInvites = useSyncExternalStore(
    subscribePendingInvites,
    getPendingInvitesSnapshot,
    getPendingInvitesServerSnapshot,
  );

  useEffect(() => {
    void fetchPendingWorkspaceInvites();
  }, [actor.id]);

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
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center bg-black text-white hover:bg-black/85 dark:bg-black dark:text-white dark:hover:bg-black/85 max-lg:hidden",
                CONNECTOR_CONTROL_RADIUS,
              )}
            >
              <Plus className="h-4 w-4" strokeWidth={1.8} />
            </button>
          ) : null
        }
      />

      {entitlements.hasWorkspaces || canCreate ? (
        <SettingsSection
          className={entitlements.canManageWorkspaces ? undefined : "mt-8"}
        >
          <SettingsGroup dividerInset="icon">
            {workspaceList.map((item) => {
              const policy = policyFor(item.id, workspacePolicies);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-muted/50"
                >
                  <WorkspaceMark
                    id={item.id}
                    name={item.name}
                    size={mobile ? "lg" : "sm"}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block font-medium tracking-[-0.01em]",
                        mobile ? "text-[15px]" : "text-[13.5px]",
                      )}
                    >
                      {item.name}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-muted-foreground",
                        mobile ? "text-[13px]" : "text-[12.5px]",
                      )}
                    >
                      {policy.members.length === 1
                        ? "1 person"
                        : `${policy.members.length} people`}
                    </span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground/70"
                    strokeWidth={1.8}
                  />
                </button>
              );
            })}
          </SettingsGroup>
          {mobile ? (
            <SettingsFootnote>
              Open a workspace to manage people, connectors, and knowledge.
            </SettingsFootnote>
          ) : null}
        </SettingsSection>
      ) : null}

      {pendingInvites.length ? (
        <PendingInvitesSection invites={pendingInvites} />
      ) : null}
    </SettingsPage>
  );
}

function PendingInvitesSection({
  invites,
}: {
  invites: WorkspaceInvite[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const respond = async (inviteId: string, action: "accept" | "decline") => {
    setBusyId(inviteId);
    setError(null);
    try {
      if (action === "accept") {
        await acceptWorkspaceInvite(inviteId);
      } else {
        await declineWorkspaceInvite(inviteId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update invite.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SettingsSection
      title="Pending"
      description="Workspace invites waiting for your approval."
      className="mt-8"
    >
      {error ? (
        <p className="mb-3 text-[12.5px] text-destructive">{error}</p>
      ) : null}
      <SettingsGroup dividerInset="icon">
        {invites.map((invite) => (
          <div
            key={invite.id}
            className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium tracking-[-0.01em]">
                {invite.workspaceName}
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                Invited by {invite.inviterName}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={busyId === invite.id}
                onClick={() => void respond(invite.id, "decline")}
                className="inline-flex h-8 items-center rounded-full border border-foreground/15 px-3.5 text-[12.5px] font-medium hover:bg-muted disabled:opacity-50"
              >
                Deny
              </button>
              <button
                type="button"
                disabled={busyId === invite.id}
                onClick={() => void respond(invite.id, "accept")}
                className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busyId === invite.id ? "Saving…" : "Approve"}
              </button>
            </div>
          </div>
        ))}
      </SettingsGroup>
    </SettingsSection>
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
  const { entitlements, removeWorkspace, actor } = useApp();
  const mobile = useMobileShell();
  const canManage = entitlements.canEditWorkspaceSettings(workspace.id);
  const [openKbId, setOpenKbId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const knowledgeInput = useRef<HTMLInputElement>(null);
  const canDelete =
    isCustomWorkspace(workspace.id) &&
    (workspaceKindOf(workspace) === "personal" ||
      entitlements.canManageWorkspaces);
  const deleteBlocked = policy.members.length > 1;
  const deleteConfirmOk =
    deleteConfirmName.trim() === workspace.name.trim();

  const handleDelete = async () => {
    if (!deleteConfirmOk) return;
    setDeleteError(null);
    setDeleteBusy(true);
    try {
      await deleteWorkspaceRemote(workspace.id);
      const ok = removeWorkspace(workspace.id);
      if (!ok) {
        setDeleteError("Could not delete this workspace.");
        return;
      }
      onBack();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete this workspace.",
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleKnowledgeFiles = async (item: KnowledgeBase, files: File[]) => {
    setUploadError(null);
    for (const file of files) {
      try {
        const contentText = await extractKnowledgeFileText(file);
        const remote = await uploadKnowledgeFile({
          workspaceId: workspace.id,
          knowledgeBaseId: item.id,
          knowledgeBaseName: item.name,
          file,
          contentText,
        });
        addKnowledgeFile(workspace.id, item.id, {
          id: remote?.id,
          name: file.name,
          size: remote?.size ?? fileSizeLabel(file.size),
          contentText,
          storagePath: remote?.storagePath,
          mimeType: remote?.mimeType ?? file.type,
          byteSize: remote?.byteSize ?? file.size,
        });
      } catch (error) {
        setUploadError(
          error instanceof Error
            ? error.message
            : `Could not upload ${file.name}.`,
        );
      }
    }
  };

  const handleAddFiles = async (files: File[]) => {
    if (!files.length) return;
    let item = policyFor(workspace.id).knowledgeBases[0];
    if (!item) {
      addKnowledgeBase(workspace.id, "Knowledge base");
      item = policyFor(workspace.id).knowledgeBases[0];
    }
    if (item) await handleKnowledgeFiles(item, files);
  };

  const handleRemoveFile = async (item: KnowledgeBase, fileId: string, storagePath?: string) => {
    setUploadError(null);
    try {
      await removeKnowledgeFileFromSupabase({
        workspaceId: workspace.id,
        knowledgeBaseId: item.id,
        fileId,
        storagePath,
      });
      removeKnowledgeFile(workspace.id, item.id, fileId);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Could not remove the file.",
      );
    }
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      setInviteError("Enter a valid email.");
      return;
    }
    setInviteBusy(true);
    setInviteError(null);
    setInviteSent(false);
    try {
      await sendWorkspaceInvite({
        workspaceId: workspace.id,
        email,
        orgId: actor.orgId ?? null,
      });
      setInviteEmail("");
      setInviteSent(true);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Could not send invite.");
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <SettingsPage>
      <SettingsHeader
        title={workspace.name}
        titleContent={
          <span className="inline-flex items-center gap-3">
            <WorkspaceMark id={workspace.id} name={workspace.name} size="lg" />
            <span>{workspace.name}</span>
          </span>
        }
        breadcrumbs={[
          { label: "Workspaces", onClick: onBack },
          { label: workspace.name },
        ]}
      />

      {canManage ? (
        <SettingsSection title="Members" className="mt-8">
          <SettingsGroup>
            <div className="space-y-3 px-4 py-4">
              <input
                value={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(event.target.value);
                  setInviteError(null);
                  setInviteSent(false);
                }}
                placeholder="Email address"
                className={settingsInputClass}
                aria-label="Invitee email"
              />
              {inviteError ? (
                <p className="text-[12.5px] text-destructive">{inviteError}</p>
              ) : null}
              {inviteSent ? (
                <p className="text-[12.5px] text-muted-foreground">
                  Invite sent — they must approve before joining.
                </p>
              ) : null}
              <button
                type="button"
                disabled={inviteBusy || !inviteEmail.trim()}
                onClick={() => void sendInvite()}
                className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
              >
                {inviteBusy ? "Sending…" : "Invite member"}
              </button>
            </div>
          </SettingsGroup>
        </SettingsSection>
      ) : null}

      <SettingsSection
        title="Knowledge base"
        className={cn(mobile ? "mt-4" : "mt-8 max-lg:mt-4")}
        actions={
          entitlements.hasKnowledgeBases ? (
            <button
              type="button"
              aria-label="Add files to knowledge base"
              title="Add files to knowledge base"
              onClick={() => knowledgeInput.current?.click()}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center bg-black text-white transition-colors hover:bg-black/85 dark:bg-black dark:text-white dark:hover:bg-black/85",
                CONNECTOR_CONTROL_RADIUS,
              )}
            >
              <Plus className="h-4 w-4" strokeWidth={1.8} />
            </button>
          ) : null
        }
      >
        <input
          ref={knowledgeInput}
          type="file"
          multiple
          accept=".md,.txt,.markdown,.csv,.json,.html,.xml,text/*,application/json"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            void handleAddFiles(files);
            event.target.value = "";
          }}
        />
        {uploadError ? (
          <p className="mb-3 text-[12.5px] text-destructive">{uploadError}</p>
        ) : null}
        {entitlements.hasKnowledgeBases ? (
          mobile ? (
            <>
              {policy.knowledgeBases.length ? (
                <SettingsGroup>
                  {policy.knowledgeBases.slice(0, 1).map((item) => (
                    <KnowledgeMobileRow
                      key={item.id}
                      workspaceId={workspace.id}
                      item={item}
                      canManage={canManage}
                      open={openKbId === item.id}
                      onUpload={(files) => void handleKnowledgeFiles(item, files)}
                      onRemoveFile={(fileId, storagePath) =>
                        void handleRemoveFile(item, fileId, storagePath)
                      }
                      onToggle={() =>
                        setOpenKbId((current) =>
                          current === item.id ? null : item.id,
                        )
                      }
                    />
                  ))}
                </SettingsGroup>
              ) : null}
            </>
          ) : (
            <div className="space-y-3">
              {policy.knowledgeBases.length ? (
                policy.knowledgeBases.slice(0, 1).map((item) => (
                  <KnowledgeCard
                    key={item.id}
                    workspaceId={workspace.id}
                    item={item}
                    canManage={canManage}
                    onUpload={(files) => void handleKnowledgeFiles(item, files)}
                    onRemoveFile={(fileId, storagePath) =>
                      void handleRemoveFile(item, fileId, storagePath)
                    }
                  />
                ))
              ) : null}
            </div>
          )
        ) : null}
      </SettingsSection>

      {entitlements.hasConnectorPolicies && canManage ? (
        <SettingsSection
          title="Connector policies"
          description="Turn a connector off for this workspace. Installed apps stay in the app; they just can't run here."
        >
          {mobile ? (
            <>
              <SettingsGroup>
                {connectors
                  .filter(
                    (item) =>
                      item.installed ||
                      policy.disabledConnectors.includes(item.id),
                  )
                  .map((item) => {
                    const off = policy.disabledConnectors.includes(item.id);
                    return (
                      <SettingsRow key={item.id} label={item.name}>
                        <SettingsSwitch
                          label={item.name}
                          checked={!off}
                          onChange={() =>
                            toggleDisabledConnector(workspace.id, item.id)
                          }
                        />
                      </SettingsRow>
                    );
                  })}
              </SettingsGroup>
              <SettingsFootnote>
                Installed apps stay in the app; they just can&apos;t run here when off.
              </SettingsFootnote>
            </>
          ) : (
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
          )}
        </SettingsSection>
      ) : null}

      {canDelete && canManage ? (
        <SettingsSection title="Danger zone" className="mt-12">
          <SettingsGroup>
            <div className="space-y-3 px-4 py-4">
              {deleteBlocked ? (
                <p className="text-[13px] text-muted-foreground">
                  Remove all other members from Organization before deleting this
                  workspace.
                </p>
              ) : confirmDelete ? (
                <>
                  <p className="text-[13px] text-muted-foreground">
                    Type{" "}
                    <span className="font-medium text-foreground">
                      {workspace.name}
                    </span>{" "}
                    to confirm deletion. This cannot be undone.
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmName}
                    onChange={(event) => setDeleteConfirmName(event.target.value)}
                    placeholder={workspace.name}
                    aria-label={`Type ${workspace.name} to confirm`}
                    className={settingsInputClass}
                  />
                  {deleteError ? (
                    <p className="text-[12.5px] text-destructive">{deleteError}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={deleteBusy || !deleteConfirmOk}
                      onClick={() => void handleDelete()}
                      className="inline-flex h-9 items-center rounded-full bg-destructive px-4 text-[13px] font-medium tracking-[-0.01em] text-destructive-foreground disabled:opacity-50"
                    >
                      {deleteBusy ? "Deleting…" : "Delete workspace"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDelete(false);
                        setDeleteConfirmName("");
                        setDeleteError(null);
                      }}
                      className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </>
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

function KnowledgeMobileRow({
  workspaceId,
  item,
  open,
  onToggle,
  onUpload,
  onRemoveFile,
  canManage,
}: {
  workspaceId: string;
  item: KnowledgeBase;
  open: boolean;
  onToggle: () => void;
  onUpload: (files: File[]) => void;
  onRemoveFile: (fileId: string, storagePath?: string) => void;
  canManage: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div>
      <SettingsLinkRow
        label={item.name}
        value={`${item.files.length} files`}
        onClick={onToggle}
      />
      {open ? (
        <div className="border-t border-border bg-muted/20 px-4 py-3">
          <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
            {item.summary}
          </p>
          <SettingsGroup className="border-0">
            {item.files.length ? (
              item.files.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px]">{entry.name}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {entry.size} · {entry.uploadedAt}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveFile(entry.id, entry.storagePath)}
                    className="shrink-0 text-[13px] text-muted-foreground hover:text-foreground"
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <div className="px-4 py-3 text-[13px] text-muted-foreground">
                No files yet.
              </div>
            )}
          </SettingsGroup>
          <div className="mt-3 flex items-center gap-2">
            <input
              ref={input}
              type="file"
              multiple
              accept=".md,.txt,.markdown,.csv,.json,.html,.xml,text/*,application/json"
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                onUpload(files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted"
            >
              <Upload className="h-3.5 w-3.5" strokeWidth={1.6} />
              Upload
            </button>
            {canManage ? (
              <button
                type="button"
                onClick={() => removeKnowledgeBase(workspaceId, item.id)}
                className="text-[13px] text-destructive"
              >
                Remove base
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KnowledgeCard({
  workspaceId,
  item,
  canManage,
  onUpload,
  onRemoveFile,
}: {
  workspaceId: string;
  item: KnowledgeBase;
  canManage: boolean;
  onUpload: (files: File[]) => void;
  onRemoveFile: (fileId: string, storagePath?: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <SettingsPanel padded className="space-y-3">
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
        {canManage ? (
          <button
            type="button"
            onClick={() => removeKnowledgeBase(workspaceId, item.id)}
            className="shrink-0 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            Remove
          </button>
        ) : null}
      </div>

      <div className={cn("settings-glass-surface overflow-hidden", SHELL_G3_RADIUS, "[&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:top-0 [&>*+*]:before:right-0 [&>*+*]:before:left-3 [&>*+*]:before:h-px [&>*+*]:before:bg-foreground/10")}>
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
                  {entry.contentText ? " · indexed" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveFile(entry.id, entry.storagePath)}
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

      <div className="flex items-center gap-2">
        <input
          ref={input}
          type="file"
          multiple
          accept=".md,.txt,.markdown,.csv,.json,.html,.xml,text/*,application/json"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            onUpload(files);
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
          Text files are indexed for AI answers.
        </p>
      </div>
    </SettingsPanel>
  );
}
