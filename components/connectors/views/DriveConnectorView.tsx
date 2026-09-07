"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { ConnectorMobileSearchBar } from "@/components/connectors/ConnectorMobileSearchBar";
import { useApp } from "@/components/app/AppProvider";
import {
  WorkspaceEmptyState,
  WorkspaceField,
  WorkspaceListRow,
  WorkspacePanelFrame,
  type WorkspaceToolbarState,
} from "@/components/connectors/views/WorkspaceViewChrome";
import { runConnectorViewOperation } from "@/lib/api/connector-client";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

const FILE_TYPE_ICON = {
  csv: "/file-types/csv.png?v=3",
  image: "/file-types/image.png?v=3",
  pdf: "/file-types/pdf.png?v=3",
  movie: "/file-types/movie.png?v=3",
  earth: "/file-types/earth.png?v=3",
  folder: "/file-types/folder.png?v=3",
  txt: "/file-types/txt.png?v=3",
  file: "/file-types/file.png?v=3",
} as const;

type Page = "browse" | "detail" | "create";

type DriveFile = {
  id: string;
  name: string;
  kind: "file" | "folder";
  mimeType: string;
  modified: string;
  modifiedAt: string | null;
  owner?: string;
  webViewLink?: string;
  sizeLabel?: string;
};

type FolderCrumb = { id: string; name: string };

type DriveTypeFilter =
  | "all"
  | "folder"
  | "doc"
  | "sheet"
  | "slides"
  | "pdf"
  | "image"
  | "video"
  | "csv"
  | "other";

type DriveSortMode = "name-asc" | "name-desc" | "modified-desc" | "modified-asc";

const DRIVE_CACHE_TTL_MS = 10 * 60 * 1000;

type DriveFolderCacheEntry = {
  files: DriveFile[];
  query: string;
  fetchedAt: number;
};

type DriveSessionCache = {
  workspaceId: string;
  folderStack: FolderCrumb[];
  query: string;
  typeFilter: DriveTypeFilter;
  sortMode: DriveSortMode;
  listScrollTop: number;
  lastSyncedAt: string | null;
  folders: Record<string, DriveFolderCacheEntry>;
};

let driveSessionCache: DriveSessionCache | null = null;

function folderCacheKey(folderId: string | null) {
  return folderId ?? "root";
}

function isCsvMime(mime: string) {
  const lower = mime.toLowerCase();
  if (lower.includes("spreadsheetml")) return false;
  return (
    lower === "text/csv" ||
    lower === "application/csv" ||
    lower.includes("csv")
  );
}

function matchesTypeFilter(file: DriveFile, filter: DriveTypeFilter) {
  if (filter === "all") return true;
  if (filter === "folder") return file.kind === "folder";
  if (file.kind === "folder") return false;
  const mime = file.mimeType;
  switch (filter) {
    case "doc":
      return mime === "application/vnd.google-apps.document";
    case "sheet":
      return mime === "application/vnd.google-apps.spreadsheet";
    case "slides":
      return mime === "application/vnd.google-apps.presentation";
    case "pdf":
      return mime === "application/pdf";
    case "image":
      return mime.startsWith("image/");
    case "video":
      return mime.startsWith("video/");
    case "csv":
      return isCsvMime(mime);
    case "other":
      return (
        mime !== "application/vnd.google-apps.document" &&
        mime !== "application/vnd.google-apps.spreadsheet" &&
        mime !== "application/vnd.google-apps.presentation" &&
        mime !== "application/pdf" &&
        !mime.startsWith("image/") &&
        !mime.startsWith("video/") &&
        !isCsvMime(mime)
      );
    default:
      return true;
  }
}

type FilePreview = {
  previewKind:
    | "text"
    | "image"
    | "pdf"
    | "video"
    | "audio"
    | "embed"
    | "link"
    | "unsupported";
  mimeType: string;
  displayUrl: string | null;
  embedUrl?: string | null;
  openUrl?: string | null;
  textContent?: string;
  linkLabel?: string;
  name: string;
};

function isFolderMime(mime: string) {
  return mime === "application/vnd.google-apps.folder";
}

function formatModified(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBytes(value: unknown): string | undefined {
  const n = typeof value === "string" ? Number(value) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function parseDriveFile(raw: unknown): DriveFile | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) return null;
  const name =
    (typeof row.name === "string" && row.name) ||
    (typeof row.title === "string" && row.title) ||
    "Untitled";
  const mimeType =
    (typeof row.mimeType === "string" && row.mimeType) ||
    (typeof row.mime_type === "string" && row.mime_type) ||
    "application/octet-stream";
  const modifiedRaw =
    (typeof row.modifiedTime === "string" && row.modifiedTime) ||
    (typeof row.modified_time === "string" && row.modified_time) ||
    null;
  let owner: string | undefined;
  if (Array.isArray(row.owners) && row.owners[0] && typeof row.owners[0] === "object") {
    const first = row.owners[0] as Record<string, unknown>;
    owner =
      (typeof first.displayName === "string" && first.displayName) ||
      (typeof first.emailAddress === "string" && first.emailAddress) ||
      undefined;
  } else if (typeof row.owner === "string") {
    owner = row.owner;
  }
  return {
    id,
    name,
    mimeType,
    kind: isFolderMime(mimeType) ? "folder" : "file",
    modified: formatModified(modifiedRaw),
    modifiedAt: modifiedRaw,
    owner,
    sizeLabel: formatBytes(row.size ?? row.quotaBytesUsed),
    webViewLink:
      (typeof row.webViewLink === "string" && row.webViewLink) ||
      (typeof row.web_view_link === "string" && row.web_view_link) ||
      undefined,
  };
}

function brandMarkId(mime: string, kind: "file" | "folder"): string | null {
  if (kind === "folder") return null;
  if (mime === "application/vnd.google-apps.document") return "gdocs";
  if (mime === "application/vnd.google-apps.spreadsheet") return "gsheets";
  return null;
}

function isEarthMime(mime: string) {
  const lower = mime.toLowerCase();
  return (
    lower === "application/vnd.google-apps.map" ||
    lower.includes("google-earth") ||
    lower.includes("kml") ||
    lower.includes("kmz") ||
    lower === "application/geo+json" ||
    lower === "application/vnd.geo+json"
  );
}

function fileTypeIconSrc(mime: string, kind: "file" | "folder"): string {
  if (kind === "folder") return FILE_TYPE_ICON.folder;
  if (isCsvMime(mime)) return FILE_TYPE_ICON.csv;
  if (isEarthMime(mime)) return FILE_TYPE_ICON.earth;
  if (mime.startsWith("image/") || mime === "image/svg+xml") {
    return FILE_TYPE_ICON.image;
  }
  if (mime === "application/pdf") return FILE_TYPE_ICON.pdf;
  if (mime.startsWith("video/")) return FILE_TYPE_ICON.movie;
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime.includes("markdown")
  ) {
    return FILE_TYPE_ICON.txt;
  }
  return FILE_TYPE_ICON.file;
}

function typeLabel(mime: string, kind: "file" | "folder") {
  if (kind === "folder") return "Folder";
  if (mime === "application/vnd.google-apps.document") return "Google Doc";
  if (mime === "application/vnd.google-apps.spreadsheet") return "Google Sheet";
  if (mime === "application/vnd.google-apps.presentation") return "Google Slides";
  if (mime === "application/vnd.google-apps.drawing") return "Drawing";
  if (mime === "application/vnd.google-apps.form") return "Form";
  if (mime === "application/vnd.google-apps.map" || isEarthMime(mime)) {
    return "Map";
  }
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime === "application/pdf") return "PDF";
  if (isCsvMime(mime)) return "CSV";
  if (mime.startsWith("text/")) return "Text";
  return "File";
}

function isVideoMimeClient(mime: string) {
  return mime.startsWith("video/");
}

function DriveTypeIcon({
  mime,
  kind,
  size = "sm",
}: {
  mime: string;
  kind: "file" | "folder";
  size?: "sm" | "md";
}) {
  const brand = brandMarkId(mime, kind);
  const dim = size === "md" ? "h-10 w-10" : "h-8 w-8";
  if (brand) {
    return (
      <ConnectorMark
        id={brand}
        size={size === "md" ? "md" : "sm"}
        className={cn(dim, "!bg-transparent")}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fileTypeIconSrc(mime, kind)}
      alt=""
      draggable={false}
      className={cn(dim, "shrink-0 object-contain")}
    />
  );
}

function clientEmbedUrl(file: DriveFile): string {
  const id = encodeURIComponent(file.id);
  switch (file.mimeType) {
    case "application/vnd.google-apps.document":
      return `https://docs.google.com/document/d/${id}/preview`;
    case "application/vnd.google-apps.spreadsheet":
      return `https://docs.google.com/spreadsheets/d/${id}/preview`;
    case "application/vnd.google-apps.presentation":
      return `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false&delayms=60000`;
    case "application/vnd.google-apps.drawing":
      return `https://docs.google.com/drawings/d/${id}/preview`;
    default:
      return `https://drive.google.com/file/d/${id}/preview`;
  }
}

function clientOpenUrl(file: DriveFile): string {
  if (file.webViewLink) return file.webViewLink;
  const id = encodeURIComponent(file.id);
  switch (file.mimeType) {
    case "application/vnd.google-apps.document":
      return `https://docs.google.com/document/d/${id}/edit`;
    case "application/vnd.google-apps.spreadsheet":
      return `https://docs.google.com/spreadsheets/d/${id}/edit`;
    case "application/vnd.google-apps.presentation":
      return `https://docs.google.com/presentation/d/${id}/edit`;
    default:
      return `https://drive.google.com/file/d/${id}/view`;
  }
}

function parsePreview(data: Record<string, unknown>, file: DriveFile): FilePreview {
  const kind = data.previewKind;
  const previewKind =
    kind === "text" ||
    kind === "image" ||
    kind === "pdf" ||
    kind === "video" ||
    kind === "audio" ||
    kind === "embed" ||
    kind === "link" ||
    kind === "unsupported"
      ? kind
      : "embed";
  return {
    previewKind,
    mimeType:
      (typeof data.mimeType === "string" && data.mimeType) || file.mimeType,
    displayUrl: typeof data.displayUrl === "string" ? data.displayUrl : null,
    embedUrl:
      (typeof data.embedUrl === "string" && data.embedUrl) ||
      clientEmbedUrl(file),
    openUrl:
      (typeof data.openUrl === "string" && data.openUrl) ||
      clientOpenUrl(file),
    textContent:
      typeof data.textContent === "string" ? data.textContent : undefined,
    linkLabel:
      typeof data.linkLabel === "string" ? data.linkLabel : "Open in Drive",
    name: (typeof data.name === "string" && data.name) || file.name,
  };
}

function formatSyncWhen(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fallBackToEmbed(prev: FilePreview | null): FilePreview | null {
  if (!prev) return null;
  const embedUrl = prev.embedUrl;
  if (!embedUrl) {
    return {
      ...prev,
      previewKind: "unsupported",
      displayUrl: null,
    };
  }
  return {
    ...prev,
    previewKind: "embed",
    displayUrl: null,
    embedUrl,
  };
}

function PreviewFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-black/[0.02] dark:bg-white/[0.03]">
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      <p className="sr-only">{title}</p>
    </div>
  );
}

export function DriveConnectorView({
  onToolbarChange,
  onOpenLink,
}: {
  onToolbarChange?: (state: WorkspaceToolbarState) => void;
  onOpenLink?: (url: string) => void;
}) {
  const { workspaceId } = useApp();
  const restored =
    driveSessionCache?.workspaceId === workspaceId ? driveSessionCache : null;
  const [page, setPage] = useState<Page>("browse");
  const [folderStack, setFolderStack] = useState<FolderCrumb[]>(
    () => restored?.folderStack ?? [],
  );
  const [files, setFiles] = useState<DriveFile[]>(() => {
    if (!restored) return [];
    const key = folderCacheKey(
      restored.folderStack[restored.folderStack.length - 1]?.id ?? null,
    );
    const entry = restored.folders[key];
    return entry && entry.query === restored.query ? entry.files : [];
  });
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selected, setSelected] = useState<DriveFile | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState(() => restored?.query ?? "");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<DriveTypeFilter>(
    () => restored?.typeFilter ?? "all",
  );
  const [sortMode, setSortMode] = useState<DriveSortMode>(
    () => restored?.sortMode ?? "name-asc",
  );
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [createMode, setCreateMode] = useState<"file" | "folder">("file");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    () => restored?.lastSyncedAt ?? null,
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  const listScrollTopRef = useRef(restored?.listScrollTop ?? 0);
  const restoreScrollPendingRef = useRef(false);

  const currentFolderId = folderStack[folderStack.length - 1]?.id ?? null;
  const locationTitle = folderStack.length
    ? folderStack[folderStack.length - 1]!.name
    : "My Drive";

  const persistSession = useCallback(
    (patch: Partial<DriveSessionCache> & { folderEntry?: DriveFolderCacheEntry }) => {
      const prev =
        driveSessionCache?.workspaceId === workspaceId
          ? driveSessionCache
          : {
              workspaceId,
              folderStack: [] as FolderCrumb[],
              query: "",
              typeFilter: "all" as DriveTypeFilter,
              sortMode: "name-asc" as DriveSortMode,
              listScrollTop: 0,
              lastSyncedAt: null as string | null,
              folders: {} as Record<string, DriveFolderCacheEntry>,
            };
      const { folderEntry, ...rest } = patch;
      const next: DriveSessionCache = {
        ...prev,
        ...rest,
        workspaceId,
        folders: { ...prev.folders },
      };
      if (folderEntry) {
        next.folders[folderCacheKey(currentFolderId)] = folderEntry;
      }
      driveSessionCache = next;
    },
    [currentFolderId, workspaceId],
  );

  const visibleFiles = useMemo(() => {
    const filtered = files.filter((file) => matchesTypeFilter(file, typeFilter));
    return [...filtered].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      if (sortMode === "name-asc" || sortMode === "name-desc") {
        const cmp = a.name.localeCompare(b.name, undefined, {
          sensitivity: "base",
        });
        return sortMode === "name-asc" ? cmp : -cmp;
      }
      const at = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
      const bt = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
      return sortMode === "modified-desc" ? bt - at : at - bt;
    });
  }, [files, sortMode, typeFilter]);

  const loadFiles = useCallback(
    async (opts?: { force?: boolean; searchQuery?: string }) => {
      const needle = (opts?.searchQuery ?? query).trim();
      const key = folderCacheKey(currentFolderId);
      const cached =
        driveSessionCache?.workspaceId === workspaceId
          ? driveSessionCache.folders[key]
          : undefined;
      if (
        !opts?.force &&
        cached &&
        cached.query === needle &&
        Date.now() - cached.fetchedAt < DRIVE_CACHE_TTL_MS
      ) {
        setFiles(cached.files);
        setStatus(
          cached.files.length
            ? null
            : needle
              ? "No matching files."
              : "This folder is empty.",
        );
        return;
      }

      setSyncing(true);
      setError(null);
      try {
        const result = await runConnectorViewOperation({
          workspaceId,
          connectorId: "gdrive",
          operation: "findFiles",
          input: {
            folderId: currentFolderId || undefined,
            query: needle
              ? needle.includes("=") || needle.includes("contains")
                ? needle
                : `name contains '${needle.replace(/'/g, "\\'")}' and trashed = false`
              : currentFolderId
                ? "trashed = false"
                : undefined,
            maxResults: 60,
          },
        });
        const rawFiles = Array.isArray(result.data.files)
          ? result.data.files
          : [];
        const parsed = rawFiles
          .map(parseDriveFile)
          .filter((file): file is DriveFile => Boolean(file));
        setFiles(parsed);
        setStatus(
          parsed.length
            ? null
            : needle
              ? "No matching files."
              : "This folder is empty.",
        );
        const syncedAt = new Date().toISOString();
        setLastSyncedAt(syncedAt);
        persistSession({
          folderStack,
          query: needle,
          typeFilter,
          sortMode,
          lastSyncedAt: syncedAt,
          listScrollTop: listScrollTopRef.current,
          folderEntry: {
            files: parsed,
            query: needle,
            fetchedAt: Date.now(),
          },
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load Drive. Connect Google Drive and try again.",
        );
        setFiles([]);
        setStatus(null);
      } finally {
        setSyncing(false);
      }
    },
    [
      currentFolderId,
      folderStack,
      persistSession,
      query,
      sortMode,
      typeFilter,
      workspaceId,
    ],
  );

  // Load when folder changes; use cache on remount / revisit.
  useEffect(() => {
    void loadFiles({ force: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only folder/workspace should auto-fetch
  }, [currentFolderId, workspaceId]);

  useEffect(() => {
    persistSession({
      folderStack,
      query,
      typeFilter,
      sortMode,
      lastSyncedAt,
      listScrollTop: listScrollTopRef.current,
    });
  }, [folderStack, lastSyncedAt, persistSession, query, sortMode, typeFilter]);

  useEffect(() => {
    if (page !== "browse" || !restoreScrollPendingRef.current) return;
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = listScrollTopRef.current;
    restoreScrollPendingRef.current = false;
  }, [page, visibleFiles.length]);

  const openFolder = useCallback((folder: DriveFile) => {
    listScrollTopRef.current = 0;
    restoreScrollPendingRef.current = false;
    setQuery("");
    setSelected(null);
    setPreview(null);
    setError(null);
    setStatus(null);
    setFolderStack((stack) => [...stack, { id: folder.id, name: folder.name }]);
    setPage("browse");
  }, []);

  const openFile = useCallback(
    async (file: DriveFile) => {
      listScrollTopRef.current = listRef.current?.scrollTop ?? 0;
      persistSession({ listScrollTop: listScrollTopRef.current });
      setSelected(file);
      setError(null);
      setStatus(null);
      setPage("detail");
      const video = isVideoMimeClient(file.mimeType);
      const workspace = file.mimeType.startsWith("application/vnd.google-apps.");
      // Google web embeds require the browser's separate Google session. Load
      // every file through the connected Drive operation instead.
      setPreview(workspace ? null : {
        previewKind: video ? "video" : "embed",
        mimeType: file.mimeType,
        displayUrl: null,
        embedUrl: clientEmbedUrl(file),
        openUrl: clientOpenUrl(file),
        name: file.name,
        linkLabel: "Open in Drive",
      });
      setPreviewLoading(true);
      try {
        const result = await runConnectorViewOperation({
          workspaceId,
          connectorId: "gdrive",
          operation: "downloadFile",
          input: {
            fileId: file.id,
            sourceMimeType: file.mimeType,
            webViewLink: file.webViewLink,
            name: file.name,
          },
        });
        const next = parsePreview(result.data, file);
        if (video) {
          setPreview({
            ...next,
            previewKind: next.displayUrl ? "video" : "embed",
            embedUrl: next.embedUrl || clientEmbedUrl(file),
          });
        } else {
          setPreview({
            ...next,
            previewKind:
              workspace && next.previewKind === "embed"
                ? "unsupported"
                : next.previewKind,
            embedUrl:
              workspace && next.previewKind === "embed"
                ? null
                : next.embedUrl || clientEmbedUrl(file),
          });
        }
      } catch {
        if (video) {
          setPreview((prev) =>
            prev
              ? {
                  ...prev,
                  previewKind: "embed",
                  displayUrl: null,
                  embedUrl: prev.embedUrl || clientEmbedUrl(file),
                }
              : prev,
          );
        }
        if (workspace) {
          setPreview({
            previewKind: "unsupported",
            mimeType: file.mimeType,
            displayUrl: null,
            openUrl: clientOpenUrl(file),
            name: file.name,
            linkLabel: "Open in Drive",
          });
        }
      } finally {
        setPreviewLoading(false);
      }
    },
    [persistSession, workspaceId],
  );

  const openExternal = useCallback(() => {
    const url =
      preview?.openUrl ||
      (selected ? clientOpenUrl(selected) : null) ||
      preview?.embedUrl;
    if (!url) return;
    if (onOpenLink) onOpenLink(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  }, [onOpenLink, preview, selected]);

  const createItem = useCallback(async () => {
    if (!name.trim()) {
      setError(createMode === "folder" ? "Add a folder name." : "Add a file name.");
      return;
    }
    if (createMode === "file" && !content.trim()) {
      setError("Add some file content.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (createMode === "folder") {
        await runConnectorViewOperation({
          workspaceId,
          connectorId: "gdrive",
          operation: "createFolder",
          input: {
            name: name.trim(),
            parentId: currentFolderId || undefined,
          },
        });
        setStatus("Folder created");
      } else {
        await runConnectorViewOperation({
          workspaceId,
          connectorId: "gdrive",
          operation: "createFromText",
          input: {
            name: name.trim(),
            content: content.trim(),
            parentId: currentFolderId || undefined,
          },
        });
        setStatus("File created");
      }
      setName("");
      setContent("");
      setPage("browse");
      await loadFiles({ force: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create item.");
    } finally {
      setBusy(false);
    }
  }, [content, createMode, currentFolderId, loadFiles, name, workspaceId]);

  useEffect(() => {
    const onDetail = page === "detail" && Boolean(selected);
    const onBrowse = page === "browse";
    onToolbarChange?.({
      title:
        page === "create"
          ? createMode === "folder"
            ? "New folder"
            : "New file"
          : onDetail
            ? selected!.name
            : locationTitle,
      syncing: syncing || previewLoading,
      busy,
      canGoBack: page !== "browse" || folderStack.length > 0,
      backLabel:
        page === "detail" || page === "create"
          ? locationTitle
          : folderStack.length > 1
            ? folderStack[folderStack.length - 2]!.name
            : "My Drive",
      primaryLabel: onDetail
        ? "Open"
        : page === "browse"
          ? "New"
          : page === "create"
            ? "Create"
            : null,
      onBack: () => {
        if (page === "detail" || page === "create") {
          restoreScrollPendingRef.current = true;
          setPage("browse");
          setSelected(null);
          setPreview(null);
          setError(null);
          return;
        }
        listScrollTopRef.current = 0;
        setFolderStack((stack) => stack.slice(0, -1));
        setQuery("");
        setError(null);
      },
      onRefresh: () => {
        if (page === "detail" && selected) {
          void openFile(selected);
          return;
        }
        void loadFiles({ force: true });
      },
      onPrimary: onDetail
        ? () => openExternal()
        : page === "browse"
          ? () => {
              setCreateMode("file");
              setName("");
              setContent("");
              setError(null);
              setStatus(null);
              setPage("create");
            }
          : page === "create"
            ? () => {
                void createItem();
              }
            : null,
      syncHint: onBrowse
        ? syncing && !lastSyncedAt
          ? `${locationTitle} · Syncing…`
          : lastSyncedAt
            ? `${locationTitle} · Last synced ${formatSyncWhen(lastSyncedAt)}`
            : locationTitle
        : null,
      driveChrome: onBrowse
        ? {
            query,
            onQueryChange: setQuery,
            onSearch: () => {
              void loadFiles({ force: true, searchQuery: query });
            },
            onOpenMobileSearch: () => setMobileSearchOpen(true),
            typeFilter,
            sortMode,
            onTypeFilter: (value) => setTypeFilter(value as DriveTypeFilter),
            onSortMode: (value) => setSortMode(value as DriveSortMode),
          }
        : null,
    });
  }, [
    busy,
    createItem,
    createMode,
    folderStack,
    lastSyncedAt,
    loadFiles,
    locationTitle,
    onToolbarChange,
    openExternal,
    openFile,
    page,
    previewLoading,
    query,
    selected,
    sortMode,
    syncing,
    typeFilter,
  ]);

  const previewSrc =
    preview?.previewKind === "embed"
      ? preview.embedUrl
      : preview?.previewKind === "pdf" ||
          preview?.previewKind === "image"
        ? preview.displayUrl
        : preview?.previewKind === "video" || preview?.previewKind === "audio"
          ? null
          : preview?.embedUrl;

  return (
    <WorkspacePanelFrame status={status} error={error}>
      {page === "create" ? (
        <div className="mobile-header-content flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreateMode("file")}
              className={cn(
                "inline-flex h-8 items-center px-3 text-[12px] font-medium",
                SHELL_G3_RADIUS,
                createMode === "file"
                  ? "bg-foreground text-background"
                  : "border border-border text-muted-foreground hover:bg-muted",
              )}
            >
              File
            </button>
            <button
              type="button"
              onClick={() => setCreateMode("folder")}
              className={cn(
                "inline-flex h-8 items-center px-3 text-[12px] font-medium",
                SHELL_G3_RADIUS,
                createMode === "folder"
                  ? "bg-foreground text-background"
                  : "border border-border text-muted-foreground hover:bg-muted",
              )}
            >
              Folder
            </button>
          </div>
          {currentFolderId ? (
            <p className="text-[12px] text-muted-foreground">
              Creating in{" "}
              <span className="font-medium text-foreground">{locationTitle}</span>
            </p>
          ) : null}
          <WorkspaceField
            label="Name"
            value={name}
            onChange={setName}
            placeholder={createMode === "folder" ? "Project files" : "notes.txt"}
          />
          {createMode === "file" ? (
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">
                Content
              </span>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={8}
                className="mt-1 w-full resize-none rounded-[10px] border border-border bg-white px-3 py-2 text-[13px] outline-none dark:bg-space-canvas"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {page === "detail" && selected ? (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {previewLoading &&
          preview?.previewKind !== "video" &&
          preview?.previewKind !== "unsupported" ? (
            <div className="pointer-events-none absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.7} />
              Loading…
            </div>
          ) : null}

          {preview?.previewKind === "text" && preview.textContent ? (
            <div className="mobile-header-content min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-foreground/90">
                {preview.textContent}
              </pre>
            </div>
          ) : preview?.previewKind === "image" && preview.displayUrl ? (
            <PreviewFrame title={preview.name}>
              <div className="flex h-full items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.displayUrl}
                  alt={preview.name}
                  className={cn(
                    "max-h-full max-w-full object-contain shadow-sm ring-1 ring-black/5 dark:ring-white/10",
                    SHELL_G3_RADIUS,
                  )}
                  onError={() => {
                    setPreview((prev) => fallBackToEmbed(prev));
                  }}
                />
              </div>
            </PreviewFrame>
          ) : preview?.previewKind === "video" ? (
            preview.displayUrl ? (
              <PreviewFrame title={preview.name}>
                <video
                  key={preview.displayUrl}
                  controls
                  playsInline
                  preload="metadata"
                  src={preview.displayUrl}
                  className="h-full w-full bg-black object-contain"
                  onError={() => {
                    setPreview((prev) => fallBackToEmbed(prev));
                  }}
                />
              </PreviewFrame>
            ) : preview.embedUrl ? (
              <PreviewFrame title={preview.name}>
                <iframe
                  title={preview.name}
                  src={preview.embedUrl}
                  className="h-full w-full border-0 bg-black"
                  allow="autoplay; encrypted-media"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </PreviewFrame>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                {previewLoading ? (
                  <>
                    <Loader2
                      className="h-5 w-5 animate-spin text-muted-foreground"
                      strokeWidth={1.7}
                    />
                    <p className="text-[13px] text-muted-foreground">
                      Loading video…
                    </p>
                  </>
                ) : (
                  <>
                    <DriveTypeIcon
                      mime={selected.mimeType}
                      kind="file"
                      size="md"
                    />
                    <p className="text-[13px] font-medium">
                      Couldn’t play this video here
                    </p>
                    <p className="max-w-sm text-[12px] text-muted-foreground">
                      Use Open in the bottom bar to watch it in Google Drive.
                    </p>
                  </>
                )}
              </div>
            )
          ) : preview?.previewKind === "audio" && preview.displayUrl ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6">
              <DriveTypeIcon mime={selected.mimeType} kind="file" size="md" />
              <audio controls src={preview.displayUrl} className="w-full max-w-md" />
            </div>
          ) : previewSrc ? (
            <PreviewFrame title={selected.name}>
              <iframe
                title={selected.name}
                src={previewSrc}
                className="h-full w-full border-0 bg-white dark:bg-space-canvas"
                allow="autoplay; encrypted-media"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </PreviewFrame>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <DriveTypeIcon
                mime={selected.mimeType}
                kind={selected.kind}
                size="md"
              />
              <p className="text-[13px] font-medium">Couldn’t load preview</p>
              <p className="max-w-sm text-[12px] text-muted-foreground">
                Use Open in the bottom bar to view this{" "}
                {typeLabel(selected.mimeType, selected.kind).toLowerCase()} in
                Google.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {page === "browse" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            ref={listRef}
            className="mobile-header-content min-h-0 flex-1 overflow-y-auto overscroll-contain"
            onScroll={(event) => {
              listScrollTopRef.current = event.currentTarget.scrollTop;
            }}
          >
            <ConnectorMobileSearchBar
              open={mobileSearchOpen}
              placeholder="Search Drive"
              value={query}
              onChange={setQuery}
              onSubmit={() => {
                void loadFiles({ force: true, searchQuery: query });
              }}
              onDismiss={() => setMobileSearchOpen(false)}
            />
            {!visibleFiles.length ? (
              <WorkspaceEmptyState
                title={syncing ? "Loading Drive…" : "Nothing here yet"}
                body={
                  error
                    ? "Connect Google Drive in Connectors, then refresh."
                    : query.trim()
                      ? "No files match this search."
                      : typeFilter !== "all"
                        ? "No files match this filter."
                        : currentFolderId
                          ? "This folder is empty. Create a file or go back."
                          : "Search or create a file to get started."
                }
                actionLabel={syncing ? "Loading…" : "Refresh"}
                syncing={syncing}
                onAction={() => void loadFiles({ force: true })}
              />
            ) : (
              visibleFiles.map((file) => (
                <WorkspaceListRow
                  key={file.id}
                  title={file.name}
                  subtitle={[
                    typeLabel(file.mimeType, file.kind),
                    file.owner,
                    file.sizeLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  meta={file.modified}
                  active={selected?.id === file.id}
                  onClick={() => {
                    if (file.kind === "folder") openFolder(file);
                    else void openFile(file);
                  }}
                  leading={
                    <span className="mt-0.5 shrink-0">
                      <DriveTypeIcon mime={file.mimeType} kind={file.kind} />
                    </span>
                  }
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </WorkspacePanelFrame>
  );
}
