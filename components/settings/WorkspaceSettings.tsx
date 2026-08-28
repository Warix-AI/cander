"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
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
  renameWorkspaceRemote,
} from "@/lib/supabase/workspace-actions";
import {
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
  policyFor,
  removeKnowledgeBase,
  removeKnowledgeFile,
  toggleDisabledConnector,
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

      {entitlements.hasWorkspaces || canCreate ? (
        <SettingsSection
          title="Your workspaces"
          description="Open a workspace to manage people, connectors, and knowledge."
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
  const { entitlements, removeWorkspace } = useApp();
  const mobile = useMobileShell();
  const [kbModalOpen, setKbModalOpen] = useState(false);
  const [kbName, setKbName] = useState("");
  const [openKbId, setOpenKbId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(workspace.name);
  const [savedName, setSavedName] = useState(workspace.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const iconInput = useRef<HTMLInputElement>(null);
  const [iconError, setIconError] = useState<string | null>(null);
  const icons = useSyncExternalStore(
    subscribeWorkspaceIcons,
    getWorkspaceIconsSnapshot,
    getWorkspaceIconsServerSnapshot,
  );
  const icon = workspaceIconFor(workspace.id, icons);

  const canDelete =
    isCustomWorkspace(workspace.id) &&
    (workspaceKindOf(workspace) === "personal" ||
      entitlements.canManageWorkspaces);
  const deleteBlocked = policy.members.length > 1;
  const deleteConfirmOk =
    deleteConfirmName.trim() === workspace.name.trim();

  const handleRename = async () => {
    const trimmed = workspaceName.trim();
    if (!trimmed || trimmed === savedName) return;
    setRenameBusy(true);
    setRenameError(null);
    try {
      await renameWorkspaceRemote(workspace.id, trimmed);
      setSavedName(trimmed);
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : "Could not rename workspace.",
      );
      setWorkspaceName(savedName);
    } finally {
      setRenameBusy(false);
    }
  };

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

  const createKnowledgeBase = () => {
    const trimmed = kbName.trim();
    if (!trimmed) return;
    addKnowledgeBase(workspace.id, trimmed);
    setKbName("");
    setKbModalOpen(false);
  };

  const workspaceSubtitle =
    "Manage name, icon, knowledge bases, and connector policies.";

  const nameDirty = workspaceName.trim() !== savedName.trim();

  return (
    <SettingsPage>
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors duration-200 hover:text-foreground max-lg:hidden"
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.7} />
        Workspaces
      </button>
      <SettingsHeader title={savedName} subtitle={workspaceSubtitle} />

      <SettingsSection title="Workspace" className="mt-6">
        <SettingsGroup>
          <div className="space-y-4 px-4 py-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                title="Upload icon"
                aria-label="Upload icon"
                onClick={() => iconInput.current?.click()}
                className="relative shrink-0"
              >
                {icon ? (
                  <span
                    className={cn(
                      "inline-flex h-10 w-10 overflow-hidden",
                      SHELL_G3_RADIUS,
                    )}
                  >
                    <img
                      src={icon}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </span>
                ) : (
                  <WorkspaceMark id={workspace.id} name={workspaceName || workspace.name} />
                )}
              </button>
              <button
                type="button"
                onClick={() => iconInput.current?.click()}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted"
              >
                <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.6} />
                {icon ? "Replace icon" : "Add icon"}
              </button>
              {icon ? (
                <button
                  type="button"
                  onClick={() => {
                    clearWorkspaceIcon(workspace.id);
                    setIconError(null);
                  }}
                  className="text-[12.5px] text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <div className="relative flex items-center gap-2">
              <input
                value={workspaceName}
                onChange={(event) => {
                  setWorkspaceName(event.target.value);
                  setRenameError(null);
                }}
                className={cn(settingsInputClass, "min-w-0 flex-1")}
                aria-label="Workspace name"
              />
              {nameDirty ? (
                <button
                  type="button"
                  disabled={renameBusy || !workspaceName.trim()}
                  onClick={() => void handleRename()}
                  className="inline-flex h-9 shrink-0 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground disabled:opacity-40"
                >
                  {renameBusy ? "Saving…" : "Save"}
                </button>
              ) : null}
            </div>
            {renameError ? (
              <p className="text-[12.5px] text-destructive">{renameError}</p>
            ) : null}
            {iconError ? (
              <p className="text-[12.5px] text-destructive">{iconError}</p>
            ) : null}
          </div>
        </SettingsGroup>
        <SettingsFootnote>
          Shown in the workspace rail. Assign people from Organization settings.
        </SettingsFootnote>
      </SettingsSection>

      <input
        ref={iconInput}
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
              setIconError(null);
            })
            .catch((err: unknown) => {
              setIconError(
                err instanceof Error ? err.message : "Could not upload image.",
              );
            });
        }}
      />

      <KnowledgeBaseModal
        open={kbModalOpen}
        onClose={() => {
          setKbModalOpen(false);
          setKbName("");
        }}
        name={kbName}
        onNameChange={setKbName}
        onCreate={createKnowledgeBase}
      />

      <SettingsSection
        title="Knowledge bases"
        description={
          entitlements.hasKnowledgeBases
            ? `Sources the app can use inside ${savedName}.`
            : "Knowledge bases start on Pro."
        }
        className={cn(mobile ? "mt-4" : "mt-8 max-lg:mt-4")}
        actions={
          entitlements.hasKnowledgeBases ? (
            <button
              type="button"
              aria-label="Create knowledge base"
              onClick={() => setKbModalOpen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-foreground/15 text-foreground hover:bg-muted"
            >
              <Plus className="h-4 w-4" strokeWidth={1.8} />
            </button>
          ) : null
        }
      >
        {entitlements.hasKnowledgeBases ? (
          mobile ? (
            <>
              <SettingsGroup>
                {policy.knowledgeBases.length ? (
                  policy.knowledgeBases.map((item) => (
                    <KnowledgeMobileRow
                      key={item.id}
                      workspaceId={workspace.id}
                      item={item}
                      open={openKbId === item.id}
                      onToggle={() =>
                        setOpenKbId((current) =>
                          current === item.id ? null : item.id,
                        )
                      }
                    />
                  ))
                ) : (
                  <div className="px-4 py-4 text-[13.5px] text-muted-foreground">
                    No knowledge bases yet.
                  </div>
                )}
              </SettingsGroup>
              <SettingsFootnote>
                PDFs, docs, and text files stay scoped to this workspace.
              </SettingsFootnote>
            </>
          ) : (
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
                    No knowledge bases yet. Use + to create one.
                  </div>
                </SettingsGroup>
              )}
            </div>
          )
        ) : null}
      </SettingsSection>

      {entitlements.hasConnectorPolicies ? (
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
                Installed apps stay in the app; they just can't run here when off.
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

      {canDelete ? (
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

function KnowledgeBaseModal({
  open,
  onClose,
  name,
  onNameChange,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  onNameChange: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="kb-modal-title"
      className="w-full max-w-[24rem]"
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <h2
            id="kb-modal-title"
            className="text-[16px] font-semibold tracking-[-0.03em]"
          >
            New knowledge base
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Upload files after creating the base.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground",
            SHELL_G3_RADIUS,
          )}
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </div>
      <form
        className="space-y-4 px-5 pb-5"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Knowledge base name"
          autoFocus
          className={settingsInputClass}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-full border border-foreground/15 px-4 text-[13px] font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
}

function KnowledgeMobileRow({
  workspaceId,
  item,
  open,
  onToggle,
}: {
  workspaceId: string;
  item: KnowledgeBase;
  open: boolean;
  onToggle: () => void;
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
                    onClick={() =>
                      removeKnowledgeFile(workspaceId, item.id, entry.id)
                    }
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
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted"
            >
              <Upload className="h-3.5 w-3.5" strokeWidth={1.6} />
              Upload
            </button>
            <button
              type="button"
              onClick={() => removeKnowledgeBase(workspaceId, item.id)}
              className="text-[13px] text-destructive"
            >
              Remove base
            </button>
          </div>
        </div>
      ) : null}
    </div>
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
        <button
          type="button"
          onClick={() => removeKnowledgeBase(workspaceId, item.id)}
          className="shrink-0 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          Remove
        </button>
      </div>

      <div className={cn("overflow-hidden border border-border/80", SHELL_G3_RADIUS, "[&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:top-0 [&>*+*]:before:right-0 [&>*+*]:before:left-3 [&>*+*]:before:h-px [&>*+*]:before:bg-border")}>
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

      <div className="flex items-center gap-2">
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
    </SettingsPanel>
  );
}
