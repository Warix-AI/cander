"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Ellipsis, FileText, FolderOpen, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { useSpaceData } from "@/components/app/SpaceDataProvider";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { DefaultChatPreviewWash } from "@/components/spaces/BannerWash";
import {
  DeleteProjectSheetBody,
  MobileBottomSheet,
  SheetAction,
} from "@/components/browser/ProjectMobileSheets";
import { Dropdown } from "@/components/ui/Controls";
import { editedMeta } from "@/lib/format-relative-time";
import { normalizeProjectTitle } from "@/lib/project-name";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { useSpaceMutation } from "@/lib/hooks/use-space-query";
import { useMobileShell } from "@/lib/use-media-query";
import type { WorkCollectionItem } from "@/lib/work-screen-data";
import type { PinKind, SpaceLayout } from "@/lib/types";
import { cn } from "@/lib/utils";

const LIST_PREVIEW_FRAME = "h-11 w-[4.4rem]";
const CARD_PREVIEW_FRAME = "aspect-[16/9] w-full";

/** Card connector tile is 80px; list uses 40% of that for the mark only. */
const CARD_CONNECTOR_MARK = "!h-20 !w-20 [&_svg]:!h-10 [&_svg]:!w-10";
const LIST_CONNECTOR_MARK = "!h-8 !w-8 [&_svg]:!h-4 [&_svg]:!w-4";

function centeredConnectorClass(compact: boolean) {
  return cn(
    compact ? "rounded-[8px]" : SHELL_G3_RADIUS,
    "relative z-10",
    compact ? LIST_CONNECTOR_MARK : CARD_CONNECTOR_MARK,
  );
}

function pinTarget(
  item: WorkCollectionItem,
): { kind: PinKind; id: string } | null {
  if (item.connectorId) {
    return { kind: "connector", id: item.connectorId };
  }
  if (item.linkedProjectId) {
    return { kind: "project", id: item.linkedProjectId };
  }
  return { kind: "project", id: item.id };
}

function projectIdForItem(item: WorkCollectionItem): string | null {
  if (item.connectorId) return null;
  if (item.linkedProjectId) return item.linkedProjectId;
  return item.id;
}

function WorkPreviewFace({
  item,
  compact = false,
}: {
  item: WorkCollectionItem;
  compact?: boolean;
}) {
  const frameClass = cn(
    "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px]",
    compact ? LIST_PREVIEW_FRAME : CARD_PREVIEW_FRAME,
  );

  if (item.connectorId) {
    return (
      <div className={frameClass}>
        <DefaultChatPreviewWash />
        <ConnectorMark
          id={item.connectorId}
          size={compact ? "sm" : "md"}
          className={centeredConnectorClass(compact)}
        />
      </div>
    );
  }

  if (item.category === "studio" && !item.cover) {
    return (
      <div className={cn(frameClass, "border border-border bg-card")}>
        <FileText
          className={cn(
            "relative z-10 text-muted-foreground",
            compact ? "h-4 w-4" : "h-5 w-5",
          )}
          strokeWidth={1.6}
        />
      </div>
    );
  }

  if (item.previewKind === "paper") {
    return (
      <div className={frameClass}>
        <DefaultChatPreviewWash />
        <div
          className={cn(
            "absolute overflow-hidden bg-white shadow-sm",
            compact
              ? "inset-x-[10%] bottom-0 top-[28%] rounded-t-[3px]"
              : "inset-x-[10%] bottom-0 top-[18%] rounded-t-[8px]",
          )}
        >
          {item.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.cover}
              alt=""
              className="h-full w-full object-cover object-top"
            />
          ) : null}
        </div>
      </div>
    );
  }

  if (item.cover) {
    return (
      <div className={cn(frameClass, "bg-muted")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.cover}
          alt=""
          className="h-full w-full object-cover object-top"
        />
      </div>
    );
  }

  return (
    <div className={frameClass}>
      <DefaultChatPreviewWash />
    </div>
  );
}

function WorkRowActions({
  item,
  onOpen,
}: {
  item: WorkCollectionItem;
  onOpen?: (item: WorkCollectionItem) => void;
}) {
  const { pinTier, setPin, clearPin, deleteProjectCompletely } = useApp();
  const mobile = useMobileShell();
  const { ctx } = useSpaceData();
  const { updateProject } = useSpaceMutation();
  const target = pinTarget(item);
  const projectId = projectIdForItem(item);
  const pinned = target ? Boolean(pinTier(target.kind, target.id)) : false;
  const canRenameOrDelete = Boolean(projectId);

  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [renameValue, setRenameValue] = useState(item.title);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);

  useEffect(() => {
    if (!renameOpen) return;
    setRenameValue(item.title);
    setRenameError(null);
  }, [renameOpen, item.title]);

  const runAndClose = (fn: () => void) => {
    fn();
    setMenuOpen(false);
  };

  const togglePin = () => {
    if (!target) return;
    if (pinned) clearPin(target.kind, target.id);
    else setPin(target.kind, target.id, "primary");
  };

  const saveRename = async () => {
    if (!projectId) return;
    const next = normalizeProjectTitle(renameValue);
    if (!next) {
      setRenameError("Project name is required.");
      return;
    }
    if (next === item.title) {
      setRenameOpen(false);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      await updateProject(ctx, projectId, { title: next });
      setRenameOpen(false);
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : "Could not rename project.",
      );
    } finally {
      setRenameBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!projectId) return;
    setDeleteOpen(false);
    setDeleteConfirm("");
    setDeleteBusy(true);
    try {
      await deleteProjectCompletely(projectId);
    } finally {
      setDeleteBusy(false);
    }
  };

  const menuItemsMobile = (
    <>
      {target ? (
        <SheetAction
          icon={pinned ? PinOff : Pin}
          label={pinned ? "Unpin" : "Pin"}
          onClick={() => runAndClose(togglePin)}
        />
      ) : null}
      <SheetAction
        icon={FolderOpen}
        label="Open"
        onClick={() =>
          runAndClose(() => {
            onOpen?.(item);
          })
        }
      />
      {canRenameOrDelete ? (
        <SheetAction
          icon={Pencil}
          label="Rename project"
          onClick={() =>
            runAndClose(() => {
              setRenameOpen(true);
            })
          }
        />
      ) : null}
      {canRenameOrDelete ? (
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

  const menuItemsDesktop = (close: () => void) => (
    <>
      {target ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            togglePin();
            close();
          }}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] hover:bg-muted"
        >
          {pinned ? (
            <PinOff className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
          ) : (
            <Pin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
          )}
          {pinned ? "Unpin" : "Pin"}
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onOpen?.(item);
          close();
        }}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] hover:bg-muted"
      >
        <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
        Open
      </button>
      {canRenameOrDelete ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setRenameOpen(true);
            close();
          }}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] hover:bg-muted"
        >
          <Pencil className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
          Rename project
        </button>
      ) : null}
      {canRenameOrDelete ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setDeleteOpen(true);
            close();
          }}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-destructive hover:bg-muted"
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
          Delete project
        </button>
      ) : null}
    </>
  );

  return (
    <span className="relative z-20 flex shrink-0 items-center">
      {mobile ? (
        <>
          <button
            type="button"
            aria-label="More"
            onClick={(event) => {
              event.preventDefault();
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
              <div className="space-y-0.5">{menuItemsMobile}</div>
            </div>
          </MobileBottomSheet>
        </>
      ) : (
        <Dropdown
          align="end"
          menuClassName="min-w-[10rem]"
          matchTrigger={false}
          trigger={({ toggle }) => (
            <button
              type="button"
              aria-label="More"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                toggle();
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-canvas-hover hover:text-foreground"
            >
              <Ellipsis className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          )}
        >
          {(close) => menuItemsDesktop(close)}
        </Dropdown>
      )}

      {renameOpen ? (
        mobile ? (
          <MobileBottomSheet
            open={renameOpen}
            onClose={() => setRenameOpen(false)}
            mode="space"
          >
            <div className="space-y-3 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-1">
              <p className="text-[15px] font-semibold tracking-[-0.02em]">
                Rename project
              </p>
              <input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveRename();
                }}
                className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[14px] outline-none"
                autoFocus
              />
              {renameError ? (
                <p className="text-[12px] text-destructive">{renameError}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameOpen(false)}
                  className="h-9 rounded-full px-3 text-[13px] text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={renameBusy}
                  onClick={() => void saveRename()}
                  className="h-9 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </MobileBottomSheet>
        ) : (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) setRenameOpen(false);
            }}
          >
            <div className="w-full max-w-sm rounded-[14px] border border-border bg-background p-4 shadow-xl">
              <p className="text-[15px] font-semibold tracking-[-0.02em]">
                Rename project
              </p>
              <input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveRename();
                  if (event.key === "Escape") setRenameOpen(false);
                }}
                className="mt-3 h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[14px] outline-none"
                autoFocus
              />
              {renameError ? (
                <p className="mt-2 text-[12px] text-destructive">{renameError}</p>
              ) : null}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameOpen(false)}
                  className="h-9 rounded-full px-3 text-[13px] text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={renameBusy}
                  onClick={() => void saveRename()}
                  className="h-9 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )
      ) : null}

      {deleteOpen && projectId ? (
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
              projectName={item.title}
              confirmText={deleteConfirm}
              busy={deleteBusy}
              onConfirmTextChange={setDeleteConfirm}
              onCancel={() => {
                setDeleteOpen(false);
                setDeleteConfirm("");
              }}
              onConfirm={() => void confirmDelete()}
            />
          </MobileBottomSheet>
        ) : (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setDeleteOpen(false);
                setDeleteConfirm("");
              }
            }}
          >
            <div className="w-full max-w-sm rounded-[14px] border border-border bg-background p-1 shadow-xl">
              <DeleteProjectSheetBody
                projectName={item.title}
                confirmText={deleteConfirm}
                busy={deleteBusy}
                onConfirmTextChange={setDeleteConfirm}
                onCancel={() => {
                  setDeleteOpen(false);
                  setDeleteConfirm("");
                }}
                onConfirm={() => void confirmDelete()}
              />
            </div>
          </div>
        )
      ) : null}
    </span>
  );
}

function WorkCollectionListRow({
  item,
  onOpen,
}: {
  item: WorkCollectionItem;
  onOpen?: (item: WorkCollectionItem) => void;
}) {
  const meta = editedMeta(item.addedAt);
  return (
    <div className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors duration-200 hover:bg-muted/40 dark:hover:bg-muted/30">
      <button
        type="button"
        onClick={() => onOpen?.(item)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors duration-200 hover:opacity-90"
      >
        <WorkPreviewFace item={item} compact />
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-medium tracking-[-0.02em]">
            {item.title}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {meta}
          </span>
        </span>
      </button>
      <WorkRowActions item={item} onOpen={onOpen} />
    </div>
  );
}

function WorkCollectionCard({
  item,
  onOpen,
}: {
  item: WorkCollectionItem;
  onOpen?: (item: WorkCollectionItem) => void;
}) {
  const meta = editedMeta(item.addedAt);
  const mark = item.title.trim().charAt(0).toUpperCase();

  return (
    <div className="flex h-full min-w-0 flex-col text-left">
      <button
        type="button"
        onClick={() => onOpen?.(item)}
        className="min-w-0 text-left transition-opacity duration-200 hover:opacity-90"
      >
        <WorkPreviewFace item={item} />
      </button>
      <div className="mt-2.5 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => onOpen?.(item)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left transition-opacity duration-200 hover:opacity-90"
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
            {mark}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-medium tracking-[-0.02em]">
              {item.title}
            </span>
            <span className="block truncate text-[12px] text-muted-foreground">
              {meta}
            </span>
          </span>
        </button>
        <WorkRowActions item={item} onOpen={onOpen} />
      </div>
    </div>
  );
}

export function WorkCollectionGrid({
  layout,
  items,
  onOpen,
  empty,
}: {
  layout: SpaceLayout;
  items: WorkCollectionItem[];
  onOpen?: (item: WorkCollectionItem) => void;
  empty?: ReactNode;
}) {
  if (!items.length) {
    if (empty) {
      return <div className="w-full pt-2 pb-8">{empty}</div>;
    }
    return (
      <p className="py-4 text-[13px] text-muted-foreground">
        Nothing in this category yet.
      </p>
    );
  }

  if (layout === "list") {
    return (
      <div>
        {items.map((item) => (
          <WorkCollectionListRow key={item.id} item={item} onOpen={onOpen} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-6 @min-[440px]:grid-cols-2 @min-[720px]:grid-cols-3">
      {items.map((item) => (
        <WorkCollectionCard key={item.id} item={item} onOpen={onOpen} />
      ))}
    </div>
  );
}
