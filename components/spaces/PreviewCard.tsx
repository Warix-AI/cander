"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  Briefcase,
  CalendarClock,
  Ellipsis,
  FileText,
  Folder,
  FolderOpen,
  Hammer,
  Link2,
  Pencil,
  Pin,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  MobileBottomSheet,
  SheetAction,
  DeleteProjectSheetBody,
} from "@/components/browser/ProjectMobileSheets";
import { BannerWash } from "@/components/spaces/BannerWash";
import { Dropdown } from "@/components/ui/Controls";
import {
  useSpaceAttachments,
  useSpaceMutation,
} from "@/lib/hooks/use-space-query";
import { useWorkspaceCtx } from "@/components/app/SpaceDataProvider";
import { normalizeProjectTitle } from "@/lib/project-name";
import type { SpaceAttachment } from "@/lib/space-entities";
import type { BannerKey } from "@/lib/space-banners";
import type { SpaceLayout } from "@/lib/types";
import type { IndexEntryKind } from "@/lib/space-index";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const PreviewAttachmentsContext = createContext<SpaceAttachment[] | null>(null);

export type PreviewKind = "product" | "paper" | "skill" | "schedule" | "file";

export type PreviewEntry = {
  id: string;
  name: string;
  projectId: string;
  meta: string;
  badge?: string;
  initial?: string;
  kind?: PreviewKind;
  detail?: string;
  image?: string;
  paperPreview?: { title: string; lines: string[] };
  /** When set, empty preview faces use this space’s banner wash. */
  bannerKey?: BannerKey;
  /** Recents index kind — drives delete chat vs delete project. */
  indexKind?: IndexEntryKind;
  /** Chat thread id when indexKind is "thread". */
  threadId?: string;
  /** When set, this chat cannot be deleted independently of the project. */
  linkedProjectId?: string;
};

export function PreviewGrid({
  layout,
  items,
  onOpen,
  empty,
  kind = "product",
  dense = false,
}: {
  layout: SpaceLayout;
  items: PreviewEntry[];
  onOpen: (projectId: string) => void;
  empty: string;
  kind?: PreviewKind;
  dense?: boolean;
}) {
  const { data: attachments } = useSpaceAttachments();

  if (!items.length) {
    return (
      <p className="mt-3 py-4 text-[13px] text-muted-foreground">{empty}</p>
    );
  }

  const body =
    layout === "list" ? (
      <div>
        {items.map((item, index) => (
          <PreviewListRow
            key={item.id}
            item={item}
            index={index}
            kind={item.kind ?? kind}
            onOpen={onOpen}
          />
        ))}
      </div>
    ) : (
      <div
        className={cn(
          "grid gap-x-3 gap-y-6",
          dense
            ? "grid-cols-1 @min-[480px]:grid-cols-2"
            : "grid-cols-1 @min-[440px]:grid-cols-2 @min-[720px]:grid-cols-3",
        )}
      >
        {items.map((item, index) => (
          <PreviewCard
            key={item.id}
            item={item}
            index={index}
            kind={item.kind ?? kind}
            onOpen={onOpen}
          />
        ))}
      </div>
    );

  return (
    <PreviewAttachmentsContext.Provider value={attachments}>
      {body}
    </PreviewAttachmentsContext.Provider>
  );
}

export function PreviewCard({
  item,
  index,
  kind = "product",
  onOpen,
}: {
  item: PreviewEntry;
  index: number;
  kind?: PreviewKind;
  onOpen: (projectId: string) => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col text-left">
      <button
        type="button"
        onClick={() => onOpen(item.projectId)}
        className="block w-full"
      >
        <PreviewFace item={item} index={index} kind={kind} />
      </button>
      <PreviewMeta item={item} kind={kind} onOpen={onOpen} />
    </div>
  );
}

function PreviewFace({
  item,
  index,
  kind,
  compact = false,
}: {
  item: PreviewEntry;
  index: number;
  kind: PreviewKind;
  compact?: boolean;
}) {
  const { spaceId } = useApp();
  const washSpace: BannerKey =
    item.bannerKey ??
    (spaceId as BannerKey | null) ??
    "build";

  if (item.image) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-[10px] bg-muted",
          compact ? "h-11 w-[4.4rem] shrink-0" : "aspect-[16/9]",
        )}
      >
        <img
          src={item.image}
          alt=""
          className="h-full w-full object-cover object-top"
        />
        {!compact && item.badge ? (
          <span className="absolute bottom-3 left-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium tracking-[-0.01em] text-foreground">
            {item.badge}
          </span>
        ) : null}
      </div>
    );
  }

  if (kind === "paper") {
    const preview = item.paperPreview;
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-[10px]",
          compact ? "h-11 w-[4.4rem] shrink-0" : "aspect-[16/9]",
        )}
      >
        <BannerWash space={washSpace} />
        <div
          className={cn(
            "absolute bg-white text-left shadow-sm",
            compact
              ? "inset-x-[18%] bottom-0 top-[28%] rounded-t-[3px]"
              : "inset-x-[20%] bottom-0 top-[25%] rounded-t-[8px]",
          )}
        >
          {preview ? (
            <>
              <p
                className={cn(
                  "font-medium text-black",
                  compact
                    ? "truncate px-1 pt-1 text-[5px] leading-tight"
                    : "px-3 pt-2.5 text-[11px] tracking-[-0.02em]",
                )}
              >
                {preview.title}
              </p>
              {!compact
                ? preview.lines.slice(0, 2).map((line) => (
                    <p
                      key={line}
                      className="px-3 text-[9px] leading-snug text-black/70"
                    >
                      {line}
                    </p>
                  ))
                : null}
            </>
          ) : null}
        </div>
      </div>
    );
  }

  if (kind === "skill") {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-[10px] border border-border bg-card",
          compact ? "h-11 w-[4.4rem] shrink-0" : "aspect-[16/9]",
        )}
      >
        <Sparkles
          className={cn(
            "absolute text-chart-2",
            compact ? "right-1.5 top-1.5 h-3 w-3" : "right-3.5 top-3.5 h-4 w-4",
          )}
          strokeWidth={1.6}
        />
        {compact ? (
          <div className="absolute inset-x-1.5 bottom-1.5 space-y-0.5">
            <div className="h-0.5 w-[90%] rounded-full bg-muted" />
            <div className="h-0.5 w-[70%] rounded-full bg-muted" />
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-0 p-4 text-left">
            <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
              {item.detail ? "Next" : "Task"}
            </p>
            <p className="mt-1 line-clamp-2 text-[15px] font-medium tracking-[-0.02em]">
              {item.detail ?? item.meta}
            </p>
          </div>
        )}
        {!compact && item.badge ? (
          <span className="absolute top-3 left-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium tracking-[-0.01em] text-foreground">
            {item.badge}
          </span>
        ) : null}
      </div>
    );
  }

  if (kind === "schedule") {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-[10px] border border-border bg-muted/50",
          compact ? "h-11 w-[4.4rem] shrink-0" : "aspect-[16/9]",
        )}
      >
        <CalendarClock
          className={cn(
            "absolute text-muted-foreground",
            compact ? "right-1.5 top-1.5 h-3 w-3" : "right-3.5 top-3.5 h-4 w-4",
          )}
          strokeWidth={1.6}
        />
        {compact ? null : (
          <div className="absolute inset-x-0 bottom-0 p-4 text-left">
            <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
              Next
            </p>
            <p className="mt-1 text-[15px] font-medium tracking-[-0.02em]">
              {item.detail ?? item.meta}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (kind === "file") {
    const ext = item.detail ?? "FILE";
    const Mark = ext.toLowerCase() === "folder" ? Folder : FileText;
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-[10px] border border-border bg-card",
          compact ? "h-11 w-[4.4rem] shrink-0" : "aspect-[16/9]",
        )}
      >
        {compact ? (
          <span className="flex h-full items-center justify-center font-mono text-[9px] text-muted-foreground">
            {ext}
          </span>
        ) : (
          <div className="absolute inset-x-0 bottom-0 p-4 text-left">
            <Mark
              className="mb-2 h-4 w-4 text-muted-foreground"
              strokeWidth={1.6}
            />
            <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
              {ext}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[10px]",
        compact ? "h-11 w-[4.4rem] shrink-0" : "aspect-[16/9]",
      )}
    >
      <BannerWash space={washSpace} />
      {!compact && item.badge ? (
        <span className="absolute bottom-3 left-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium tracking-[-0.01em] text-foreground">
          {item.badge}
        </span>
      ) : null}
    </div>
  );
}

function PreviewListRow({
  item,
  index,
  kind,
  onOpen,
}: {
  item: PreviewEntry;
  index: number;
  kind: PreviewKind;
  onOpen: (projectId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] py-2 transition-colors duration-200 hover:bg-muted/40 dark:hover:bg-muted/30">
      <button
        type="button"
        onClick={() => onOpen(item.projectId)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <PreviewFace item={item} index={index} kind={kind} compact />
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-medium tracking-[-0.02em]">
            {item.name}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {item.meta}
          </span>
        </span>
      </button>
      <PreviewActions item={item} kind={kind} onOpen={onOpen} />
    </div>
  );
}

function PreviewMeta({
  item,
  kind,
  onOpen,
}: {
  item: PreviewEntry;
  kind: PreviewKind;
  onOpen: (projectId: string) => void;
}) {
  const mark = item.initial ?? item.name.trim().charAt(0).toUpperCase();
  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      <button
        type="button"
        onClick={() => onOpen(item.projectId)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
          {mark}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-medium tracking-[-0.02em]">
            {item.name}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {item.meta}
          </span>
        </span>
      </button>
      <PreviewActions item={item} kind={kind} onOpen={onOpen} />
    </div>
  );
}

function PreviewActions({
  item,
  kind,
  onOpen,
}: {
  item: PreviewEntry;
  kind: PreviewKind;
  onOpen: (projectId: string) => void;
}) {
  const {
    pinTier,
    setPin,
    clearPin,
    workspaceId,
    promoteToWork,
    promoteToBuild,
    deleteChat,
    deleteProjectCompletely,
  } = useApp();
  const mobile = useMobileShell();
  const ctx = useWorkspaceCtx();
  const { attachToWork, detachFromWork, updateProject } = useSpaceMutation();
  const attachments = useContext(PreviewAttachmentsContext) ?? [];
  const tier = pinTier("project", item.projectId);
  const pinned = Boolean(tier);
  const inWork = attachments.some((row) => row.targetId === item.projectId);
  const isChat = item.indexKind === "thread";
  const isProject =
    item.indexKind === "project" ||
    (!item.indexKind && (kind === "product" || kind === "paper"));
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteBlockedNote, setDeleteBlockedNote] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState(item.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);

  useEffect(() => {
    if (!renameOpen) return;
    setRenameValue(item.name);
    setRenameError(null);
  }, [renameOpen, item.name]);

  const copyLink = () => {
    const slug = item.name.toLowerCase().replace(/\s+/g, "-");
    void navigator.clipboard.writeText(`https://${slug}.app`);
  };

  const saveRename = async () => {
    const next = normalizeProjectTitle(renameValue);
    if (!next) {
      setRenameError("Project name is required.");
      return;
    }
    if (next === item.name) {
      setRenameOpen(false);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      await updateProject(ctx, item.projectId, { title: next });
      setRenameOpen(false);
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : "Could not rename project.",
      );
    } finally {
      setRenameBusy(false);
    }
  };

  const runAndClose = (fn: () => void) => {
    fn();
    setMenuOpen(false);
  };

  const isProjectTiedChat = isChat && Boolean(item.linkedProjectId);
  const chatThreadId = item.threadId ?? item.projectId;

  const tryDeleteChat = () => {
    if (isProjectTiedChat) {
      setDeleteBlockedNote(
        "This chat is tied to its project. Delete the project to remove it.",
      );
      return;
    }
    void deleteChat(chatThreadId);
  };

  const confirmDeleteProject = async () => {
    setDeleteOpen(false);
    setDeleteConfirm("");
    setDeleteBusy(true);
    try {
      await deleteProjectCompletely(item.projectId);
    } finally {
      setDeleteBusy(false);
    }
  };

  const deleteMenuItems = (
    <>
      {isChat ? (
        <SheetAction
          icon={Trash2}
          label="Delete chat"
          destructive
          onClick={() =>
            runAndClose(() => {
              tryDeleteChat();
            })
          }
        />
      ) : null}
      {isProject ? (
        <SheetAction
          icon={Trash2}
          label="Delete project"
          destructive
          onClick={() =>
            runAndClose(() => {
              setDeleteOpen(true);
            })
          }
        />
      ) : null}
    </>
  );

  const deleteDesktopItems = (close: () => void) => (
    <>
      {isChat ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            tryDeleteChat();
            close();
          }}
          className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] text-destructive hover:bg-muted"
        >
          Delete chat
        </button>
      ) : null}
      {isProject ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setDeleteOpen(true);
            close();
          }}
          className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] text-destructive hover:bg-muted"
        >
          Delete project
        </button>
      ) : null}
    </>
  );

  const menuBody = (
    <>
      <SheetAction
        icon={FolderOpen}
        label="Open"
        onClick={() =>
          runAndClose(() => {
            onOpen(item.projectId);
          })
        }
      />
      {kind === "product" || kind === "paper" ? (
        <>
          <SheetAction
            icon={Pencil}
            label="Rename project"
            onClick={() =>
              runAndClose(() => {
                setRenameOpen(true);
              })
            }
          />
          <SheetAction
            icon={Pin}
            label={pinned ? "Unpin" : "Pin"}
            onClick={() =>
              runAndClose(() => {
                if (pinned) clearPin("project", item.projectId);
                else setPin("project", item.projectId, "primary");
              })
            }
          />
          <SheetAction
            icon={Link2}
            label="Copy link"
            onClick={() => runAndClose(copyLink)}
          />
          {kind === "product" ? (
            <SheetAction
              icon={Briefcase}
              label={inWork ? "Remove from Work" : "Add to Work"}
              onClick={() =>
                runAndClose(() => {
                  if (inWork) {
                    void detachFromWork(`attach-${item.projectId}`);
                  } else {
                    void attachToWork(ctx, {
                      type: "project",
                      id: item.projectId,
                      space: "build",
                      workspaceId,
                      label: item.name,
                    });
                  }
                })
              }
            />
          ) : (
            <>
              <SheetAction
                icon={Hammer}
                label="Use in Build"
                onClick={() =>
                  runAndClose(() => {
                    promoteToBuild({
                      type: "source",
                      id: item.projectId,
                      space: "research",
                      workspaceId,
                      label: item.name,
                      snapshot: item.meta,
                    });
                  })
                }
              />
              <SheetAction
                icon={Briefcase}
                label="Add to Work"
                onClick={() =>
                  runAndClose(() => {
                    promoteToWork({
                      type: "source",
                      id: item.projectId,
                      space: "research",
                      workspaceId,
                      label: item.name,
                    });
                  })
                }
              />
            </>
          )}
        </>
      ) : kind === "file" ? (
        <>
          <SheetAction
            icon={Hammer}
            label="Use in Build"
            onClick={() =>
              runAndClose(() => {
                promoteToBuild({
                  type: "source",
                  id: item.projectId,
                  space: "research",
                  workspaceId,
                  label: item.name,
                  snapshot: item.meta,
                });
              })
            }
          />
          <SheetAction
            icon={Briefcase}
            label="Add to Work"
            onClick={() =>
              runAndClose(() => {
                promoteToWork({
                  type: "source",
                  id: item.projectId,
                  space: "research",
                  workspaceId,
                  label: item.name,
                });
              })
            }
          />
        </>
      ) : null}
      {deleteMenuItems}
    </>
  );

  return (
    <span className="flex shrink-0 items-center">
      {mobile ? (
        <>
          <button
            type="button"
            aria-label="More"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen(true);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-canvas-hover hover:text-foreground"
          >
            <Ellipsis className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
          <MobileBottomSheet
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            mode="space"
          >
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-1">
              <div className="space-y-0.5">{menuBody}</div>
            </div>
          </MobileBottomSheet>
        </>
      ) : (
        <Dropdown
          align="end"
          menuClassName="min-w-[9.5rem]"
          matchTrigger={false}
          trigger={({ toggle }) => (
            <button
              type="button"
              aria-label="More"
              onClick={(event) => {
                event.stopPropagation();
                toggle();
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-canvas-hover hover:text-foreground"
            >
              <Ellipsis className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          )}
        >
          {(close) => (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpen(item.projectId);
                  close();
                }}
                className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
              >
                Open
              </button>
              {kind === "product" || kind === "paper" ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setRenameOpen(true);
                      close();
                    }}
                    className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
                  >
                    Rename project
                  </button>
                  {!pinned ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setPin("project", item.projectId, "primary");
                        close();
                      }}
                      className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
                    >
                      Pin
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        clearPin("project", item.projectId);
                        close();
                      }}
                      className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
                    >
                      Unpin
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      copyLink();
                      close();
                    }}
                    className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
                  >
                    Copy link
                  </button>
                  {kind === "product" ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        if (inWork) {
                          void detachFromWork(`attach-${item.projectId}`);
                        } else {
                          void attachToWork(ctx, {
                            type: "project",
                            id: item.projectId,
                            space: "build",
                            workspaceId,
                            label: item.name,
                          });
                        }
                        close();
                      }}
                      className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
                    >
                      {inWork ? "Remove from Work" : "Add to Work"}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          promoteToBuild({
                            type: "source",
                            id: item.projectId,
                            space: "research",
                            workspaceId,
                            label: item.name,
                            snapshot: item.meta,
                          });
                          close();
                        }}
                        className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
                      >
                        Use in Build
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          promoteToWork({
                            type: "source",
                            id: item.projectId,
                            space: "research",
                            workspaceId,
                            label: item.name,
                          });
                          close();
                        }}
                        className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
                      >
                        Add to Work
                      </button>
                    </>
                  )}
                </>
              ) : kind === "file" ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      promoteToBuild({
                        type: "source",
                        id: item.projectId,
                        space: "research",
                        workspaceId,
                        label: item.name,
                        snapshot: item.meta,
                      });
                      close();
                    }}
                    className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
                  >
                    Use in Build
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      promoteToWork({
                        type: "source",
                        id: item.projectId,
                        space: "research",
                        workspaceId,
                        label: item.name,
                      });
                      close();
                    }}
                    className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
                  >
                    Add to Work
                  </button>
                </>
              ) : null}
              {deleteDesktopItems(close)}
            </>
          )}
        </Dropdown>
      )}
      {deleteOpen ? (
        mobile ? (
          <MobileBottomSheet
            open={deleteOpen}
            onClose={() => {
              setDeleteOpen(false);
              setDeleteConfirm("");
            }}
            mode="delete"
          >
            <DeleteProjectSheetBody
              projectName={item.name}
              busy={deleteBusy}
              confirmText={deleteConfirm}
              onConfirmTextChange={setDeleteConfirm}
              onCancel={() => {
                setDeleteOpen(false);
                setDeleteConfirm("");
              }}
              onConfirm={() => void confirmDeleteProject()}
            />
          </MobileBottomSheet>
        ) : (
          <div
            className="fixed inset-0 z-[60] flex items-start justify-center bg-black/20 pt-24"
            onClick={(event) => {
              event.stopPropagation();
              if (event.target === event.currentTarget) {
                setDeleteOpen(false);
                setDeleteConfirm("");
              }
            }}
          >
            <div
              className="w-full max-w-sm rounded-[16px] border border-border bg-background p-4 shadow-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <DeleteProjectSheetBody
                projectName={item.name}
                busy={deleteBusy}
                confirmText={deleteConfirm}
                onConfirmTextChange={setDeleteConfirm}
                onCancel={() => {
                  setDeleteOpen(false);
                  setDeleteConfirm("");
                }}
                onConfirm={() => void confirmDeleteProject()}
              />
            </div>
          </div>
        )
      ) : null}
      {deleteBlockedNote ? (
        mobile ? (
          <MobileBottomSheet
            open={Boolean(deleteBlockedNote)}
            onClose={() => setDeleteBlockedNote(null)}
            mode="delete"
          >
            <div className="flex min-h-0 flex-1 flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-1">
              <p className="text-[15px] font-medium tracking-[-0.01em]">
                Can&apos;t delete chat
              </p>
              <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted-foreground">
                {deleteBlockedNote}
              </p>
              <button
                type="button"
                onClick={() => setDeleteBlockedNote(null)}
                className="mt-4 h-10 w-full rounded-[12px] bg-foreground text-[13px] font-medium text-background"
              >
                OK
              </button>
            </div>
          </MobileBottomSheet>
        ) : (
          <div
            className="fixed inset-0 z-[60] flex items-start justify-center bg-black/20 pt-24"
            onClick={() => setDeleteBlockedNote(null)}
          >
            <div
              className="w-full max-w-sm rounded-[16px] border border-border bg-background p-4 shadow-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="text-[14px] font-medium tracking-[-0.01em]">
                Can&apos;t delete chat
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {deleteBlockedNote}
              </p>
              <button
                type="button"
                onClick={() => setDeleteBlockedNote(null)}
                className="mt-4 h-9 rounded-[10px] bg-foreground px-3.5 text-[13px] font-medium text-background"
              >
                OK
              </button>
            </div>
          </div>
        )
      ) : null}
      {renameOpen ? (
        mobile ? (
          <MobileBottomSheet
            open={renameOpen}
            onClose={() => setRenameOpen(false)}
            mode="rename"
          >
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2">
              <p className="text-[1.25rem] font-semibold tracking-[-0.02em]">
                Rename project
              </p>
              <input
                autoFocus
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveRename();
                  }
                }}
                spellCheck={false}
                className="mt-4 h-11 w-full rounded-[12px] border border-border bg-muted/40 px-3.5 text-[15px] outline-none"
              />
              {renameError ? (
                <p className="mt-2 text-[12px] text-destructive">{renameError}</p>
              ) : (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Must be unique across this workspace.
                </p>
              )}
              <div className="mt-6 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRenameOpen(false)}
                  className="h-11 rounded-full border border-border text-[14px] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={renameBusy}
                  onClick={() => void saveRename()}
                  className="h-11 rounded-full bg-foreground text-[14px] font-medium text-background disabled:opacity-60"
                >
                  Save changes
                </button>
              </div>
            </div>
          </MobileBottomSheet>
        ) : (
          <div
            className="fixed inset-0 z-[60] flex items-start justify-center bg-black/20 pt-24"
            onClick={(event) => {
              event.stopPropagation();
              if (event.target === event.currentTarget) setRenameOpen(false);
            }}
          >
            <div
              className="w-full max-w-sm rounded-[16px] border border-border bg-background p-4 shadow-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="text-[14px] font-medium tracking-[-0.01em]">
                Rename project
              </p>
              <input
                autoFocus
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveRename();
                  }
                  if (event.key === "Escape") setRenameOpen(false);
                }}
                spellCheck={false}
                className="mt-3 h-10 w-full rounded-[12px] border border-border bg-muted/40 px-3 text-[14px] outline-none"
              />
              {renameError ? (
                <p className="mt-2 text-[12px] text-destructive">{renameError}</p>
              ) : (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Must be unique across this workspace.
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameOpen(false)}
                  className="h-9 rounded-[10px] px-3 text-[13px] text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={renameBusy}
                  onClick={() => void saveRename()}
                  className="h-9 rounded-[10px] bg-foreground px-3.5 text-[13px] font-medium text-background disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )
      ) : null}
    </span>
  );
}
