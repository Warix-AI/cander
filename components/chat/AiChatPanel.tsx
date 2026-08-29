"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { CanderMark } from "@/components/brand/CanderMark";
import { Composer } from "@/components/shell/Composer";
import {
  createAiChat,
  deleteAiChat,
  listAiChatMessages,
  listAiChats,
  renameAiChat,
  sendAiChatMessage,
  setAiChatContext,
  type AiChatDto,
  type AiChatMessageDto,
  type AiContextRefInput,
} from "@/lib/api/ai-chat-api";
import { APP_MESSAGE_PLACEHOLDER, APP_TAGLINE } from "@/lib/app-brand";
import { useMobileShell } from "@/lib/use-media-query";
import { useShellStyle } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";
import { MOBILE_APP_BG } from "@/lib/mobile-menu-styles";

function contextRefsFromApp(opts: {
  workspaceId: string;
  projectId: string | null;
  projectSpace?: string | null;
}): AiContextRefInput[] {
  const refs: AiContextRefInput[] = [
    { kind: "workspace", id: opts.workspaceId, workspaceId: opts.workspaceId },
  ];
  if (opts.projectId) {
    const kind = opts.projectSpace === "research" ? "research" : "project";
    refs.push({
      kind,
      id: opts.projectId,
      workspaceId: opts.workspaceId,
    });
  }
  return refs;
}

export function AiChatPanel() {
  const { workspaceId, projectId, project } = useApp();
  const mobile = useMobileShell();
  const floating = useShellStyle() === "floating";
  const [chats, setChats] = useState<AiChatDto[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const activeChat = chats.find((c) => c.id === chatId) ?? null;

  const refreshChats = useCallback(async () => {
    const { chats: next } = await listAiChats();
    setChats(next);
    return next;
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const { messages: next } = await listAiChatMessages(id);
    setMessages(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const next = await refreshChats();
        if (cancelled) return;
        if (next.length) {
          setChatId(next[0].id);
        } else {
          setChatId(null);
          setMessages([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load private chats",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshChats]);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await loadMessages(chatId);
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load messages",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, loadMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  // Keep authorized context refs in sync for the active chat.
  useEffect(() => {
    if (!chatId || !workspaceId) return;
    const refs = contextRefsFromApp({
      workspaceId,
      projectId,
      projectSpace: project?.space,
    });
    void setAiChatContext(chatId, refs).catch(() => {
      // Non-fatal — send path still works without context.
    });
  }, [chatId, workspaceId, projectId, project?.space]);

  const ensureChat = async () => {
    if (chatId) return chatId;
    const refs = contextRefsFromApp({
      workspaceId,
      projectId,
      projectSpace: project?.space,
    });
    const { chat } = await createAiChat({
      workspaceId,
      contextRefs: refs,
    });
    setChats((prev) => [chat, ...prev]);
    setChatId(chat.id);
    return chat.id;
  };

  const onNewChat = async () => {
    try {
      setError(null);
      setOffline(false);
      const refs = contextRefsFromApp({
        workspaceId,
        projectId,
        projectSpace: project?.space,
      });
      const { chat } = await createAiChat({
        workspaceId,
        contextRefs: refs,
      });
      setChats((prev) => [chat, ...prev]);
      setChatId(chat.id);
      setMessages([]);
      setMenuOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create chat");
    }
  };

  const onRename = async () => {
    if (!chatId || !titleDraft.trim()) return;
    try {
      const { chat } = await renameAiChat(chatId, titleDraft.trim());
      setChats((prev) => prev.map((c) => (c.id === chat.id ? chat : c)));
      setRenaming(false);
      setMenuOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    }
  };

  const onDelete = async () => {
    if (!chatId) return;
    try {
      await deleteAiChat(chatId);
      const next = chats.filter((c) => c.id !== chatId);
      setChats(next);
      setChatId(next[0]?.id ?? null);
      setMenuOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const onSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    setOffline(false);
    try {
      const id = await ensureChat();
      const optimistic: AiChatMessageDto = {
        id: `local-${Date.now()}`,
        chat_id: id,
        owner_id: "",
        role: "user",
        content: trimmed,
        status: "complete",
        sort_order: messages.length,
        error: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      const result = await sendAiChatMessage(id, trimmed);
      setMessages((prev) => {
        const withoutOpt = prev.filter((m) => m.id !== optimistic.id);
        return [
          ...withoutOpt,
          result.userMessage,
          result.assistantMessage,
        ];
      });
      if (result.offline) setOffline(true);
      await refreshChats();
    } catch (err) {
      setOffline(true);
      setError(
        err instanceof Error
          ? err.message
          : "AI is unavailable. Check the tunnel and bridge.",
      );
    } finally {
      setSending(false);
    }
  };

  const onRetry = async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser || !chatId) return;
    setSending(true);
    setError(null);
    setOffline(false);
    try {
      const result = await sendAiChatMessage(chatId, lastUser.content);
      setMessages((prev) => [...prev, result.assistantMessage]);
      if (result.offline) setOffline(true);
      await refreshChats();
    } catch (err) {
      setOffline(true);
      setError(
        err instanceof Error ? err.message : "Retry failed — AI unavailable",
      );
    } finally {
      setSending(false);
    }
  };

  const empty = !loading && messages.length === 0 && !sending;

  return (
    <section
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        mobile ? MOBILE_APP_BG : "bg-background",
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2 sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium tracking-[-0.01em]">
            {activeChat?.title ?? "Private AI"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Owner-private · not shared with workspace
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onNewChat()}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="New chat"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" strokeWidth={1.6} />
          New
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={!chatId}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            aria-label="Chat actions"
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={1.6} />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-border bg-background p-1 shadow-md">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-muted"
                onClick={() => {
                  setTitleDraft(activeChat?.title ?? "");
                  setRenaming(true);
                  setMenuOpen(false);
                }}
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
                Rename
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-red-600 hover:bg-muted"
                onClick={() => void onDelete()}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {chats.length > 1 ? (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border/40 px-3 py-2 sm:px-4">
          {chats.map((chat) => (
            <button
              key={chat.id}
              type="button"
              onClick={() => setChatId(chat.id)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[12px] transition-colors",
                chat.id === chatId
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              {chat.title}
            </button>
          ))}
        </div>
      ) : null}

      {renaming ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2 sm:px-4">
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2.5 text-[13px] outline-none focus:border-foreground/30"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void onRename();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
          <button
            type="button"
            className="rounded-lg bg-foreground px-2.5 py-1.5 text-[12px] text-background"
            onClick={() => void onRename()}
          >
            Save
          </button>
        </div>
      ) : null}

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          floating ? "px-4 py-5 sm:px-6" : "px-4 py-5 sm:px-6",
        )}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.6} />
          </div>
        ) : empty ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <CanderMark className="mb-4 !h-[35.64px] !w-[37.2px]" />
            <h1 className="heading-display text-[1.85rem] tracking-[-0.02em]">
              {APP_TAGLINE}
            </h1>
            <p className="mt-2 max-w-sm text-[14px] text-muted-foreground">
              Private AI chat — only you can see these conversations.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[38rem] flex-col gap-6">
            {messages.map((message) => (
              <AiBubble key={message.id} message={message} />
            ))}
            {sending ? (
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.6} />
                Thinking…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {(offline || error) && (
        <div className="shrink-0 border-t border-border/50 bg-muted/40 px-4 py-2 text-[12.5px] text-muted-foreground sm:px-6">
          <span>
            {error ??
              "AI bridge unavailable. Start Ollama, the local bridge, and the HTTPS tunnel."}
          </span>
          {offline || error ? (
            <button
              type="button"
              className="ml-2 font-medium text-foreground underline-offset-2 hover:underline"
              onClick={() => void onRetry()}
              disabled={sending || !messages.some((m) => m.role === "user")}
            >
              Retry
            </button>
          ) : null}
        </div>
      )}

      <div className={cn("shrink-0", mobile && MOBILE_APP_BG)}>
        <Composer
          onSend={(t) => void onSend(t)}
          hideSpaceTools
          placeholder={APP_MESSAGE_PLACEHOLDER}
          landing={empty}
        />
      </div>
    </section>
  );
}

function AiBubble({ message }: { message: AiChatMessageDto }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      {isUser ? (
        <div className="max-w-[min(78%,36rem)] rounded-2xl bg-muted px-3.5 py-2.5">
          <p className="text-[14.5px] leading-relaxed tracking-[-0.01em]">
            {message.content}
          </p>
        </div>
      ) : (
        <div className="w-full space-y-1">
          <p
            className={cn(
              "text-[14.5px] leading-relaxed tracking-[-0.01em]",
              message.status === "error" && "text-muted-foreground",
            )}
          >
            {message.content}
          </p>
          {message.error ? (
            <p className="text-[12px] text-muted-foreground">{message.error}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
