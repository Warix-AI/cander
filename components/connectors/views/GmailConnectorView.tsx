"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, Paperclip, RefreshCw, Send } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { MailBody } from "@/components/connectors/views/MailBody";
import { MailHtmlFrame } from "@/components/connectors/views/MailHtmlFrame";
import {
  fetchSyncedMailDetail,
  fetchSyncedMailList,
  runConnectorViewOperation,
  syncConnectorView,
  type SyncedMailDetail,
  type SyncedMailListItem,
} from "@/lib/api/connector-client";
import {
  resolveMailHtml,
  resolveMailPlainText,
} from "@/lib/mail-body-sanitize";
import { cn } from "@/lib/utils";

type Page = "inbox" | "compose" | "detail" | "forward";

const POLL_MS = 45_000;

function formatWhen(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function senderLabel(fromAddr: string | null) {
  if (!fromAddr) return "Unknown";
  const match = fromAddr.match(/^"?([^"<]+)"?\s*</);
  return (match?.[1] ?? fromAddr).trim();
}

function senderEmail(fromAddr: string | null) {
  if (!fromAddr) return "";
  const match = fromAddr.match(/<([^>]+)>/);
  return (match?.[1] ?? fromAddr).trim();
}

/** One inbox row per Gmail thread (latest message wins). */
function groupIntoThreads(messages: SyncedMailListItem[]): SyncedMailListItem[] {
  const byThread = new Map<string, SyncedMailListItem>();
  for (const item of messages) {
    const key = item.threadId || item.providerMessageId;
    const existing = byThread.get(key);
    if (!existing) {
      byThread.set(key, item);
      continue;
    }
    const existingTime = existing.receivedAt
      ? new Date(existing.receivedAt).getTime()
      : 0;
    const nextTime = item.receivedAt ? new Date(item.receivedAt).getTime() : 0;
    const newer = nextTime >= existingTime ? item : existing;
    byThread.set(key, {
      ...newer,
      isUnread: existing.isUnread || item.isUnread,
      hasAttachments: existing.hasAttachments || item.hasAttachments,
    });
  }
  return [...byThread.values()].sort((a, b) => {
    const at = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
    const bt = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
    return bt - at;
  });
}

export type GmailToolbarState = {
  page: Page;
  syncing: boolean;
  busy: boolean;
  canGoInbox: boolean;
  isUnread: boolean;
  /** Shown beside Inbox in the chrome, e.g. "Last sync 6:44 PM". */
  syncHint: string | null;
  onRefresh: () => void;
  onCompose: () => void;
  onInbox: () => void;
  onArchive: () => void;
  onToggleRead: () => void;
  onForward: () => void;
  onFocusReply: () => void;
};

export function GmailConnectorView({
  onOpenLink,
  onToolbarChange,
}: {
  onOpenLink?: (url: string) => void;
  onToolbarChange?: (state: GmailToolbarState) => void;
} = {}) {
  const { workspaceId } = useApp();
  const [page, setPage] = useState<Page>("inbox");
  const [messages, setMessages] = useState<SyncedMailListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SyncedMailDetail | null>(null);
  const [threadMessages, setThreadMessages] = useState<SyncedMailDetail[]>([]);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement | null>(null);
  const connectionIdRef = useRef<string | null>(null);
  connectionIdRef.current = connectionId;
  /** Message IDs marked read in this session — survive list reloads until server catches up. */
  const locallyReadIdsRef = useRef(new Set<string>());

  const threads = useMemo(() => groupIntoThreads(messages), [messages]);

  const loadList = useCallback(async () => {
    setError(null);
    const data = await fetchSyncedMailList({
      workspaceId,
      connectorId: "gmail",
    });
    const readLocally = locallyReadIdsRef.current;
    setMessages(
      data.messages.map((row) =>
        readLocally.has(row.providerMessageId)
          ? { ...row, isUnread: false }
          : row,
      ),
    );
    setConnectionId(data.connectionId);
    setLastSyncedAt(data.sync.lastSyncedAt);
    return data;
  }, [workspaceId]);

  const goInbox = useCallback(() => {
    setPage("inbox");
    setDetail(null);
    setThreadMessages([]);
    setSelectedId(null);
    setReplyBody("");
    setReplyOpen(false);
    setStatus(null);
    setError(null);
  }, []);

  const goCompose = useCallback(() => {
    setPage("compose");
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setStatus(null);
    setError(null);
  }, []);

  const focusReply = useCallback(() => {
    setPage("detail");
    setReplyOpen(true);
    requestAnimationFrame(() => {
      replyRef.current?.focus();
      replyRef.current?.scrollIntoView({ block: "nearest" });
    });
  }, []);

  const refresh = useCallback(async () => {
    setSyncing(true);
    setError(null);
    setStatus(null);
    try {
      const synced = await syncConnectorView({
        workspaceId,
        connectorId: "gmail",
        connectionId: connectionIdRef.current ?? undefined,
      });
      setLastSyncedAt(synced.lastSyncedAt);
      setConnectionId(synced.connectionId);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }, [loadList, workspaceId]);

  const loadThreadBodies = useCallback(
    async (seed: SyncedMailDetail, list: SyncedMailListItem[]) => {
      const threadKey = seed.threadId || seed.providerMessageId;
      const siblings = list
        .filter(
          (item) =>
            (item.threadId || item.providerMessageId) === threadKey ||
            item.providerMessageId === seed.providerMessageId,
        )
        .sort((a, b) => {
          const at = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
          const bt = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
          return at - bt;
        });

      const details: SyncedMailDetail[] = [];
      for (const item of siblings) {
        if (item.providerMessageId === seed.providerMessageId) {
          details.push(seed);
          continue;
        }
        try {
          const data = await fetchSyncedMailDetail({
            workspaceId,
            connectorId: "gmail",
            connectionId: connectionIdRef.current ?? undefined,
            messageId: item.providerMessageId,
          });
          details.push(data.message);
        } catch {
          details.push({
            ...item,
            bodyText: item.snippet,
            bodyHtml: null,
          });
        }
      }
      setThreadMessages(details.length ? details : [seed]);
    },
    [workspaceId],
  );

  const runOp = useCallback(
    async (
      operation: string,
      input?: Record<string, unknown>,
      okMessage?: string,
    ): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        await runConnectorViewOperation({
          workspaceId,
          connectorId: "gmail",
          connectionId: connectionIdRef.current ?? undefined,
          operation,
          input,
        });
        if (okMessage) setStatus(okMessage);
        await loadList();
        if (operation === "archive") {
          goInbox();
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Operation failed.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [goInbox, loadList, workspaceId],
  );

  const archiveCurrent = useCallback(() => {
    if (!detail) return;
    void runOp(
      "archive",
      { messageId: detail.providerMessageId },
      "Archived",
    );
  }, [detail, runOp]);

  const toggleReadCurrent = useCallback(() => {
    if (!detail) return;
    const markingRead = detail.isUnread;
    void runOp(
      markingRead ? "markRead" : "markUnread",
      { messageId: detail.providerMessageId },
      markingRead ? "Marked read" : "Marked unread",
    ).then((ok) => {
      if (!ok) return;
      setDetail((current) =>
        current ? { ...current, isUnread: !markingRead } : current,
      );
      setThreadMessages((prev) =>
        prev.map((msg) =>
          msg.providerMessageId === detail.providerMessageId
            ? { ...msg, isUnread: !markingRead }
            : msg,
        ),
      );
    });
  }, [detail, runOp]);

  const forwardCurrent = useCallback(() => {
    if (!detail) return;
    const plain = resolveMailPlainText(detail);
    setReplyOpen(false);
    setReplyBody("");
    setComposeTo("");
    setComposeSubject(
      detail.subject?.toLowerCase().startsWith("fwd:")
        ? detail.subject
        : `Fwd: ${detail.subject || "(no subject)"}`,
    );
    setComposeBody(
      `\n\n---------- Forwarded message ----------\nFrom: ${detail.fromAddr || "Unknown"}\nDate: ${detail.receivedAt || ""}\nSubject: ${detail.subject || "(no subject)"}\nTo: ${(detail.toAddrs ?? []).join(", ")}\n\n${plain}`,
    );
    setPage("forward");
    setStatus(null);
    setError(null);
  }, [detail]);

  useEffect(() => {
    if (!onToolbarChange) return;
    const syncHint = syncing
      ? "Syncing…"
      : lastSyncedAt
        ? `Last sync ${formatWhen(lastSyncedAt)}`
        : null;
    onToolbarChange({
      page,
      syncing,
      busy,
      canGoInbox: page !== "inbox",
      isUnread: Boolean(detail?.isUnread),
      syncHint,
      onRefresh: () => void refresh(),
      onCompose: goCompose,
      onInbox: goInbox,
      onArchive: archiveCurrent,
      onToggleRead: toggleReadCurrent,
      onForward: forwardCurrent,
      onFocusReply: focusReply,
    });
  }, [
    page,
    syncing,
    busy,
    lastSyncedAt,
    refresh,
    goCompose,
    goInbox,
    focusReply,
    detail?.isUnread,
    archiveCurrent,
    toggleReadCurrent,
    forwardCurrent,
    onToolbarChange,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await loadList();
        if (cancelled) return;
        if (!data.messages.length && !data.sync.lastSyncedAt) {
          setSyncing(true);
          try {
            await syncConnectorView({
              workspaceId,
              connectorId: "gmail",
            });
            if (!cancelled) await loadList();
          } catch (err) {
            if (!cancelled) {
              setError(
                err instanceof Error ? err.message : "Could not sync Gmail.",
              );
            }
          } finally {
            if (!cancelled) setSyncing(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load mail.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList, workspaceId]);

  // Quiet background sync so new mail lands as threads without manual refresh.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      void syncConnectorView({
        workspaceId,
        connectorId: "gmail",
        connectionId: connectionIdRef.current ?? undefined,
      })
        .then(async (synced) => {
          setLastSyncedAt(synced.lastSyncedAt);
          setConnectionId(synced.connectionId);
          if (synced.upserted > 0) await loadList();
        })
        .catch(() => {
          /* quiet */
        });
    };
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [loadList, workspaceId]);

  const openMessage = async (item: SyncedMailListItem) => {
    setSelectedId(item.providerMessageId);
    setPage("detail");
    setReplyBody("");
    setReplyOpen(false);
    setStatus(null);
    setBusy(true);
    setError(null);

    const threadKey = item.threadId || item.providerMessageId;
    const threadUnreadIds = messages
      .filter(
        (row) =>
          row.isUnread &&
          (row.threadId || row.providerMessageId) === threadKey,
      )
      .map((row) => row.providerMessageId);

    // Optimistic: clear blue dots for the whole thread immediately.
    if (threadUnreadIds.length || item.isUnread) {
      const unreadSet = new Set(
        threadUnreadIds.length ? threadUnreadIds : [item.providerMessageId],
      );
      for (const id of unreadSet) locallyReadIdsRef.current.add(id);
      setMessages((prev) =>
        prev.map((row) =>
          unreadSet.has(row.providerMessageId)
            ? { ...row, isUnread: false }
            : row,
        ),
      );
      for (const messageId of unreadSet) {
        void runConnectorViewOperation({
          workspaceId,
          connectorId: "gmail",
          connectionId: connectionIdRef.current ?? undefined,
          operation: "markRead",
          input: { messageId },
        }).catch(() => {
          /* non-blocking */
        });
      }
    }

    // Paint headers immediately so open feels instant while HTML loads.
    const provisional: SyncedMailDetail = {
      ...item,
      isUnread: false,
      bodyText: null,
      bodyHtml: null,
    };
    setDetail(provisional);
    setThreadMessages([provisional]);
    try {
      const data = await fetchSyncedMailDetail({
        workspaceId,
        connectorId: "gmail",
        connectionId: connectionId ?? undefined,
        messageId: item.providerMessageId,
      });
      setDetail({ ...data.message, isUnread: false });
      await loadThreadBodies({ ...data.message, isUnread: false }, messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open message.");
    } finally {
      setBusy(false);
    }
  };

  const sendCompose = async () => {
    if (!composeTo.trim() || (!composeSubject.trim() && !composeBody.trim())) {
      setError("Add a recipient and a subject or body.");
      return;
    }
    await runOp(
      "compose",
      {
        to: composeTo.trim(),
        subject: composeSubject.trim(),
        body: composeBody,
      },
      page === "forward" ? "Forwarded" : "Sent",
    );
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    goInbox();
  };

  const sendReply = async () => {
    if (!detail?.threadId || !replyBody.trim()) {
      setError("Write a reply first.");
      return;
    }
    await runOp(
      "reply",
      {
        threadId: detail.threadId,
        body: replyBody,
        to: senderEmail(detail.fromAddr) || detail.fromAddr || undefined,
      },
      "Reply sent",
    );
    setReplyBody("");
    setReplyOpen(false);
    // Refresh so the sent reply joins the thread list on next sync.
    void refresh();
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-black">
      {error ? (
        <p className="shrink-0 border-b border-black/5 px-3 py-2 text-[12px] text-destructive dark:border-white/10">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="shrink-0 border-b border-black/5 px-3 py-1.5 text-[11px] text-muted-foreground dark:border-white/10">
          {status}
        </p>
      ) : null}

      {page === "compose" || page === "forward" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="text-[12px] font-medium text-muted-foreground">
            {page === "forward" ? "Forward" : "New message"}
          </p>
          <Field label="To" value={composeTo} onChange={setComposeTo} />
          <Field
            label="Subject"
            value={composeSubject}
            onChange={setComposeSubject}
          />
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">
              Body
            </span>
            <textarea
              value={composeBody}
              onChange={(event) => setComposeBody(event.target.value)}
              rows={10}
              className="mt-1 w-full resize-none rounded-[10px] border border-border bg-white px-3 py-2 text-[13px] outline-none dark:bg-black"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void sendCompose()}
            className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full bg-primary px-4 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {page === "forward" ? "Send forward" : "Send"}
          </button>
        </div>
      ) : null}

      {page === "detail" && detail ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="px-4 pb-3 pt-4">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">
                {detail.subject || "(no subject)"}
              </h2>
            </div>
            <div className="space-y-0">
              {(threadMessages.length ? threadMessages : [detail]).map(
                (msg) => {
                  const html = resolveMailHtml(msg);
                  const plain = resolveMailPlainText(msg);
                  return (
                    <article
                      key={msg.providerMessageId}
                      className="border-b border-black/5 last:border-b-0 dark:border-white/10"
                    >
                      <div className="flex items-start gap-3 px-4 pb-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-semibold text-foreground">
                          {senderLabel(msg.fromAddr).slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <p className="truncate text-[13.5px] font-medium text-foreground">
                              {senderLabel(msg.fromAddr)}
                            </p>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {formatWhen(msg.receivedAt)}
                            </span>
                          </div>
                          <p className="text-[12px] text-muted-foreground">
                            to {(msg.toAddrs ?? []).join(", ") || "me"}
                          </p>
                        </div>
                      </div>
                      <div className="w-full overflow-hidden px-[10px] bg-white dark:bg-black">
                        {(() => {
                          const loadingBody =
                            busy &&
                            msg.providerMessageId === detail.providerMessageId &&
                            !html;
                          if (loadingBody) {
                            return (
                              <div className="flex min-h-[12rem] items-center justify-center bg-white dark:bg-black">
                                <Loader2
                                  className="h-6 w-6 animate-spin text-muted-foreground"
                                  strokeWidth={1.8}
                                />
                              </div>
                            );
                          }
                          if (html) {
                            return (
                              <MailHtmlFrame
                                html={html}
                                onOpenLink={onOpenLink}
                              />
                            );
                          }
                          return (
                            <div className="py-3">
                              <MailBody
                                text={plain}
                                onOpenLink={onOpenLink}
                                hasAttachments={msg.hasAttachments}
                              />
                            </div>
                          );
                        })()}
                      </div>
                      {html && msg.hasAttachments ? (
                        <p className="inline-flex items-center gap-1.5 px-4 py-2 text-[12px] text-muted-foreground">
                          <Paperclip className="h-3.5 w-3.5" />
                          Attachments
                        </p>
                      ) : null}
                    </article>
                  );
                },
              )}
            </div>
          </div>

          {replyOpen ? (
            <div className="shrink-0 border-t border-black/5 bg-white px-4 py-3 dark:border-white/10 dark:bg-black">
              <textarea
                ref={replyRef}
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                rows={3}
                placeholder="Write a reply…"
                className="w-full resize-none rounded-[10px] border border-border bg-transparent px-3 py-2 text-[13px] outline-none"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReplyOpen(false);
                    setReplyBody("");
                  }}
                  className="inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !replyBody.trim()}
                  onClick={() => void sendReply()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send reply
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {page === "inbox" ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <p className="px-4 py-6 text-[12.5px] text-muted-foreground">
              Loading inbox…
            </p>
          ) : null}
          {!loading && !threads.length ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[13px] font-medium text-foreground">
                No messages yet
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Refresh to sync recent mail from Gmail.
              </p>
              <button
                type="button"
                disabled={syncing}
                onClick={() => void refresh()}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-medium hover:bg-muted"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", syncing && "animate-spin")}
                />
                Sync now
              </button>
            </div>
          ) : null}
          {threads.map((item) => (
            <button
              key={item.threadId || item.providerMessageId}
              type="button"
              onClick={() => void openMessage(item)}
              className={cn(
                "flex w-full gap-3 border-b border-black/5 px-4 py-3 text-left transition-colors hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04]",
                selectedId === item.providerMessageId &&
                  "bg-black/[0.04] dark:bg-white/[0.05]",
              )}
            >
              <div
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  item.isUnread ? "bg-sky-500" : "bg-transparent",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[13px]",
                      item.isUnread
                        ? "font-semibold text-foreground"
                        : "font-medium text-foreground/90",
                    )}
                  >
                    {senderLabel(item.fromAddr)}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {formatWhen(item.receivedAt)}
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-0.5 flex items-center gap-1.5 truncate text-[12.5px]",
                    item.isUnread
                      ? "font-medium text-foreground"
                      : "text-foreground/80",
                  )}
                >
                  <span className="truncate">
                    {item.subject || "(no subject)"}
                  </span>
                  {item.hasAttachments ? (
                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : null}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">
                  {item.snippet || ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-[10px] border border-border bg-white px-3 text-[13px] outline-none dark:bg-black"
      />
    </label>
  );
}
