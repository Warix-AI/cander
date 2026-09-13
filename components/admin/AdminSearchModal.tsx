"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Activity,
  Building2,
  ChartNoAxesColumn,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Receipt,
  Search,
  Users,
} from "lucide-react";
import { NativeOverlayGate } from "@/components/browser/NativeOverlayGate";
import { useAdmin } from "@/components/admin/AdminProvider";
import { Modal } from "@/components/ui/Modal";
import {
  ADMIN_SECTION_LABELS,
  ADMIN_SECTIONS,
  type AdminSection,
} from "@/lib/admin/sections";
import { cn } from "@/lib/utils";

type HitIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

type Hit = {
  id: string;
  title: string;
  meta: string;
  group: string;
  icon?: HitIcon;
  run: () => void;
};

const SECTION_ICONS: Record<AdminSection, HitIcon> = {
  overview: LayoutDashboard,
  plans: CreditCard,
  pricing: Receipt,
  accounts: Users,
  usage: ChartNoAxesColumn,
  subscriptions: ClipboardList,
  enterprise: Building2,
  audit: Search,
  operations: Activity,
};

type AccountHit = {
  id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
};

/**
 * Admin omnibox — sections + live account search (⌘K / header Search).
 */
export function AdminSearchModal() {
  const {
    searchOpen,
    setSearchOpen,
    setSection,
    setSelectedAccountId,
    setMobileSurface,
    fetchJson,
  } = useAdmin();
  const open = searchOpen;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [accounts, setAccounts] = useState<AccountHit[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const needle = query.trim();

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setQuery("");
      setActive(0);
      setAccounts([]);
    });
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open || needle.length < 2) {
      setAccounts([]);
      setLoadingAccounts(false);
      return;
    }
    let cancelled = false;
    setLoadingAccounts(true);
    const timer = window.setTimeout(() => {
      void fetchJson<{ accounts?: AccountHit[] }>(
        `/api/admin/accounts?q=${encodeURIComponent(needle)}&limit=12`,
      )
        .then((res) => {
          if (cancelled) return;
          setAccounts(res.accounts ?? []);
        })
        .catch(() => {
          if (cancelled) return;
          setAccounts([]);
        })
        .finally(() => {
          if (!cancelled) setLoadingAccounts(false);
        });
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, needle, fetchJson]);

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-search-index="${active}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const hits = useMemo(() => {
    const match = (value: string) =>
      !needle || value.toLowerCase().includes(needle.toLowerCase());
    const items: Hit[] = [];

    for (const id of ADMIN_SECTIONS) {
      const title = ADMIN_SECTION_LABELS[id];
      if (!match(title) && !match(id)) continue;
      items.push({
        id: `section-${id}`,
        title,
        meta: "Admin section",
        group: "Navigate",
        icon: SECTION_ICONS[id],
        run: () => {
          setSection(id);
          setMobileSurface("workspace");
        },
      });
    }

    for (const account of accounts) {
      const title =
        account.name?.trim() || account.email?.trim() || account.id.slice(0, 8);
      items.push({
        id: `account-${account.id}`,
        title,
        meta: [account.email, account.plan].filter(Boolean).join(" · ") || "Account",
        group: "Accounts",
        icon: Users,
        run: () => {
          setSelectedAccountId(account.id);
          setSection("accounts");
          setMobileSurface("workspace");
        },
      });
    }

    return items;
  }, [
    needle,
    accounts,
    setSection,
    setSelectedAccountId,
    setMobileSurface,
  ]);

  const choose = (hit: Hit) => {
    hit.run();
    setSearchOpen(false);
  };

  return (
    <>
      <NativeOverlayGate open={open} />
      <Modal
        open={open}
        onClose={() => setSearchOpen(false)}
        labelledBy="admin-search-title"
        backdropClassName="bg-black/25"
        className="menu-glass-surface flex w-[min(40rem,calc(100vw-2rem))] flex-col overflow-hidden"
      >
        <div className="relative border-b border-foreground/[0.08] bg-transparent">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.6}
          />
          <input
            ref={inputRef}
            id="admin-search-title"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((n) => Math.min(hits.length - 1, n + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((n) => Math.max(0, n - 1));
              }
              if (event.key === "Enter" && hits[active]) {
                event.preventDefault();
                choose(hits[active]);
              }
            }}
            placeholder="Search admin sections and accounts"
            className="h-12 w-full bg-transparent pr-4 pl-11 text-[15px] tracking-[-0.01em] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div
          ref={listRef}
          className="max-h-[min(28rem,60vh)] overflow-y-auto px-2 py-2"
        >
          {loadingAccounts && needle.length >= 2 ? (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              Searching accounts…
            </p>
          ) : hits.length ? (
            hits.map((hit, index) => {
              const showGroup = hit.group !== hits[index - 1]?.group;
              const Icon = hit.icon ?? Search;
              const selected = index === active;
              return (
                <div key={hit.id}>
                  {showGroup ? (
                    <p className="px-2.5 pt-2.5 pb-1.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground/90 uppercase">
                      {hit.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    data-search-index={index}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(hit)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors duration-150",
                      selected
                        ? "search-modal-row-active"
                        : "search-modal-row-hover",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
                        selected
                          ? "bg-foreground/[0.08] text-foreground"
                          : "bg-foreground/[0.04] text-muted-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium tracking-[-0.02em]">
                        {hit.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                        {hit.meta}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })
          ) : (
            <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
              Nothing matches that search.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-foreground/[0.08] px-3.5 py-2.5 text-[11px] text-muted-foreground">
          <span className="ml-auto hidden font-mono tracking-wide sm:inline">
            ⌘K
          </span>
        </div>
      </Modal>
    </>
  );
}
