"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowLeft,
  Mail,
  MailOpen,
  Paperclip,
  RefreshCw,
  Reply,
  Send,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { MailBody } from "@/components/connectors/views/MailBody";
import {
  fetchSyncedMailDetail,
  fetchSyncedMailList,
  runConnectorViewOperation,
  syncConnectorView,
  type SyncedMailDetail,
  type SyncedMailListItem,
} from "@/lib/api/connector-client";
import { cn } from "@/lib/utils";

type Page = "inbox" | "compose" | "detail";

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

export type GmailToolbarState = {
  page: Page;
  syncing: boolean;
  busy: boolean;
  canGoInbox: boolean;
  onRefresh: () => void;
  onCompose: () => void;
  onInbox: () => void;
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
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setError(null);
    const data = await fetchSyncedMailList({
      workspaceId,
      connectorId: "gmail",
    });
    setMessages(data.messages);
    setConnectionId(data.connectionId);
    setLastSyncedAt(data.sync.lastSyncedAt);
    return data;
  }, [workspaceId]);

  const goInbox = useCallback(() => {
    setPage("inbox");
    setDetail(null);
    setSelectedId(null);
    setReplyOpen(false);
    setStatus(null);
    setError(null);
  }, []);

  const goCompose = useCallback(() => {
    setPage("compose");
    setStatus(null);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    setSyncing(true);
    setError(null);
    setStatus(null);
    try {
      const synced = await syncConnectorView({
        workspaceId,
        connectorId: "gmail",
        connectionId: connectionId ?? undefined,
      });
      setLastSyncedAt(synced.lastSyncedAt);
      await loadList();
      setStatus(`Synced ${synced.upserted} messages`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }, [connectionId, loadList, workspaceId]);

  useEffect(() => {
    if (!onToolbarChange) return;
    onToolbarChange({
      page,
      syncing,
      busy,
      canGoInbox: page !== "inbox",
      onRefresh: () => void refresh(),
      onCompose: goCompose,
      onInbox: goInbox,
    });
  }, [page, syncing, busy, refresh, goCompose, goInbox, onToolbarChange]);

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

  const openMessage = async (item: SyncedMailListItem) => {
    setSelectedId(item.providerMessageId);
    setPage("detail");
    setReplyOpen(false);
    setReplyBody("");
    setStatus(null);
    setBusy(true);
    setError(null);
    try {
      const data = await fetchSyncedMailDetail({
        workspaceId,
        connectorId: "gmail",
        connectionId: connectionId ?? undefined,
        messageId: item.providerMessageId,
      });
      setDetail(data.message);
      if (item.isUnread) {
        void runConnectorViewOperation({
          workspaceId,
          connectorId: "gmail",
          connectionId: connectionId ?? undefined,
          operation: "markRead",
          input: { messageId: item.providerMessageId },
        })
          .then(() => {
            setMessages((prev) =>
              prev.map((row) =>
                row.providerMessageId === item.providerMessageId
                  ? { ...row, isUnread: false }
                  : row,
              ),
            );
            setDetail((current) =>
              current ? { ...current, isUnread: false } : current,
            );
          })
          .catch(() => {
            /* non-blocking */
          });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open message.");
    } finally {
      setBusy(false);
    }
  };

  const runOp = async (
    operation: string,
    input?: Record<string, unknown>,
    okMessage?: string,
  ) => {
    setBusy(true);
    setError(null);
    try {
      await runConnectorViewOperation({
        workspaceId,
        connectorId: "gmail",
        connectionId: connectionId ?? undefined,
        operation,
        input,
      });
      if (okMessage) setStatus(okMessage);
      await loadList();
      if (operation === "archive" && selectedId) {
        goInbox();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed.");
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
      "Sent",
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
        to: detail.fromAddr ?? undefined,
      },
      "Reply sent",
    );
    setReplyOpen(false);
    setReplyBody("");
  };

  const bodyText =
    detail?.bodyText?.trim() ||
    (detail?.bodyHtml
      ? detail.bodyHtml
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
      : "") ||
    detail?.snippet?.trim() ||
    "";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {error ? (
        <p className="shrink-0 border-b border-border px-3 py-2 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="shrink-0 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          {status}
          {lastSyncedAt ? ` · Last sync ${formatWhen(lastSyncedAt)}` : null}
        </p>
      ) : null}

      {page === "compose" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
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
              className="mt-1 w-full resize-none rounded-[10px] border border-border bg-card px-3 py-2 text-[13px] outline-none"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void sendCompose()}
            className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full bg-primary px-4 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
        </div>
      ) : null}

      {page === "detail" && detail ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
            <button
              type="button"
              onClick={goInbox}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Inbox
            </button>
            <div className="ml-auto flex items-center gap-0.5">
              <IconBtn
                label="Reply"
                onClick={() => setReplyOpen(true)}
                icon={<Reply className="h-3.5 w-3.5" />}
              />
              <IconBtn
                label={detail.isUnread ? "Mark read" : "Mark unread"}
                onClick={() =>
                  void runOp(
                    detail.isUnread ? "markRead" : "markUnread",
                    { messageId: detail.providerMessageId },
                    detail.isUnread ? "Marked read" : "Marked unread",
                  ).then(() => {
                    setDetail((current) =>
                      current
                        ? { ...current, isUnread: !current.isUnread }
                        : current,
                    );
                  })
                }
                icon={
                  detail.isUnread ? (
                    <MailOpen className="h-3.5 w-3.5" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )
                }
              />
              <IconBtn
                label="Archive"
                onClick={() =>
                  void runOp(
                    "archive",
                    { messageId: detail.providerMessageId },
                    "Archived",
                  )
                }
                icon={<Archive className="h-3.5 w-3.5" />}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">
              {detail.subject || "(no subject)"}
            </h2>
            <div className="mt-3 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-semibold text-foreground">
                {senderLabel(detail.fromAddr).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-foreground">
                  {senderLabel(detail.fromAddr)}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {detail.fromAddr}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  to {(detail.toAddrs ?? []).join(", ") || "me"}
                  {detail.receivedAt ? ` · ${formatWhen(detail.receivedAt)}` : ""}
                </p>
              </div>
            </div>
            {detail.hasAttachments ? (
              <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                Attachments
              </p>
            ) : null}
            <div className="mt-5 border-t border-border/70 pt-5">
              {busy && !detail.bodyText && !detail.bodyHtml ? (
                <p className="text-[13px] text-muted-foreground">Loading…</p>
              ) : (
                <MailBody text={bodyText} onOpenLink={onOpenLink} />
              )}
            </div>
            {replyOpen ? (
              <div className="mt-5 space-y-2 rounded-[12px] border border-border bg-card p-3 shadow-sm">
                <textarea
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  rows={5}
                  placeholder="Write a reply…"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void sendReply()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send reply
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {page === "inbox" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-6 text-[12.5px] text-muted-foreground">
              Loading inbox…
            </p>
          ) : null}
          {!loading && !messages.length ? (
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
          {messages.map((item) => (
            <button
              key={item.providerMessageId}
              type="button"
              onClick={() => void openMessage(item)}
              className={cn(
                "flex w-full gap-3 border-b border-border/70 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                selectedId === item.providerMessageId && "bg-muted/40",
              )}
            >
              <div
                className={cn(
                  "mt-1 h-2 w-2 shrink-0 rounded-full",
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
                    "mt-0.5 truncate text-[12.5px]",
                    item.isUnread
                      ? "font-medium text-foreground"
                      : "text-foreground/80",
                  )}
                >
                  {item.subject || "(no subject)"}
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
        className="mt-1 h-9 w-full rounded-[10px] border border-border bg-card px-3 text-[13px] outline-none"
      />
    </label>
  );
}

function IconBtn({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {icon}
    </button>
  );
}
