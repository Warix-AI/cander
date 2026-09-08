"use client";

import { MobileFloatingNav } from "@/components/shell/mobile/MobileFloatingNav";
import { ConnectorLoadingState } from "@/components/connectors/views/ConnectorLoadingState";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { ConnectorMobileSearchBar } from "@/components/connectors/ConnectorMobileSearchBar";
import {
  StripeEntityAvatar,
  emailFromStripeRaw,
} from "@/components/connectors/views/StripeEntityAvatar";
import { useApp } from "@/components/app/AppProvider";
import {
  connectorLabelForId,
  setConnectorFocus,
} from "@/lib/connector-focus";
import {
  WorkspaceEmptyState,
  WorkspaceField,
  WorkspaceListRow,
  WorkspacePanelFrame,
  type WorkspaceToolbarState,
} from "@/components/connectors/views/WorkspaceViewChrome";
import { runConnectorViewOperation } from "@/lib/api/connector-client";
import {
  connectionsForConnectorLive,
  getConnectorConnectionsRevision,
  getConnectorConnectionsServerSnapshot,
  getConnectorConnectionsSnapshot,
  subscribeConnectorConnections,
} from "@/lib/connector-connections-store";
import {
  invalidateConnectorViewCache,
  invalidateViewCache,
  patchViewCache,
  peekViewCache,
  viewCacheKey,
  writeViewCache,
} from "@/lib/connectors/view-session-cache";
import type { AppListItem } from "@/lib/connectors/apps/definitions";
import {
  detailFieldsForResource,
  pickStripeImageUrl,
  type StripeBalanceLine,
  type StripeDetailField,
  type StripeResource,
} from "@/lib/connectors/apps/stripe-format";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

type TabId = "overview" | "customers" | "invoices" | "payments" | "products";
type Page = "browse" | "detail" | "create";
type PaymentSegment = "charges" | "payment_intents";

/** Per-tab / payment-segment list+balance payload (freshness keyed here). */
type StripeSectionCache = {
  items: AppListItem[];
  balanceLines: StripeBalanceLine[];
  status: string | null;
  error: string | null;
  query: string;
  lastSyncedAt: string | null;
};

/** UI chrome that must not reset section TTLs. */
type StripeChromeCache = {
  tab: TabId;
  page: Page;
  paymentSegment: PaymentSegment;
  query: string;
  selected: AppListItem | null;
  detailFields: StripeDetailField[];
  detailRaw: Record<string, unknown> | null;
  subscriptions: AppListItem[];
  prices: AppListItem[];
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "customers", label: "Customers" },
  { id: "invoices", label: "Invoices" },
  { id: "payments", label: "Payments" },
  { id: "products", label: "Products" },
];

function sectionScope(tab: TabId, paymentSegment: PaymentSegment): string {
  if (tab === "overview") return "overview";
  if (tab === "payments") return paymentSegment;
  return tab;
}

function formatSyncWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function isNotConnectedError(message: string) {
  return /not connected|no active connection|connect .+ and try|authorization/i.test(
    message,
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function resourceForTab(
  tab: TabId,
  paymentSegment: PaymentSegment,
): StripeResource | null {
  switch (tab) {
    case "customers":
      return "customers";
    case "invoices":
      return "invoices";
    case "payments":
      return paymentSegment;
    case "products":
      return "products";
    default:
      return null;
  }
}

function emptyCopy(tab: TabId, paymentSegment: PaymentSegment) {
  switch (tab) {
    case "customers":
      return {
        title: "No customers yet",
        body: "Add a customer to start tracking invoices and payments.",
      };
    case "invoices":
      return {
        title: "No invoices yet",
        body: "Invoices will show up here once they're created in Stripe.",
      };
    case "payments":
      return paymentSegment === "charges"
        ? {
            title: "No charges yet",
            body: "Successful and attempted charges appear here.",
          }
        : {
            title: "No payment intents yet",
            body: "Payment intents (checkout attempts) appear here.",
          };
    case "products":
      return {
        title: "No products yet",
        body: "Products from your Stripe catalog will show up here.",
      };
    default:
      return { title: "Nothing here", body: "Refresh to try again." };
  }
}

function DetailRows({ fields }: { fields: StripeDetailField[] }) {
  if (!fields.length) {
    return (
      <p className="text-[12px] text-muted-foreground">
        No details available for this item.
      </p>
    );
  }
  return (
    <dl className="space-y-3">
      {fields.map((field) => (
        <div key={field.label}>
          <dt className="text-[11px] font-medium text-muted-foreground">
            {field.label}
          </dt>
          <dd className="mt-0.5 break-words text-[13px] text-foreground">
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
        SHELL_G3_RADIUS,
      )}
    >
      {label}
    </span>
  );
}

export function StripeConnectorView({
  onToolbarChange,
}: {
  onToolbarChange?: (state: WorkspaceToolbarState) => void;
}) {
  const connectorId = "stripe";
  const { workspaceId } = useApp();
  const chromeKey = viewCacheKey(connectorId, workspaceId, "chrome");
  const chromeHit = peekViewCache<StripeChromeCache>(chromeKey);
  const initialTab = TABS[0]!.id;
  const initialSegment = chromeHit?.data.paymentSegment ?? "charges";
  const initialSectionKey = viewCacheKey(
    connectorId,
    workspaceId,
    sectionScope(initialTab, initialSegment),
  );
  const initialSection = peekViewCache<StripeSectionCache>(initialSectionKey);

  const connectionRevision = useSyncExternalStore(
    subscribeConnectorConnections,
    getConnectorConnectionsRevision,
    () => 0,
  );
  void getConnectorConnectionsSnapshot;
  void getConnectorConnectionsServerSnapshot;

  const isConnected = connectionsForConnectorLive(workspaceId, connectorId).some(
    (row) => row.status === "active",
  );
  const wasConnectedRef = useRef(isConnected);
  const retryTimerRef = useRef<number | null>(null);

  const [tab, setTab] = useState<TabId>(() => initialTab);
  const [page, setPage] = useState<Page>(
    () => chromeHit?.data.page ?? "browse",
  );
  const [paymentSegment, setPaymentSegment] = useState<PaymentSegment>(
    () => initialSegment,
  );
  const [query, setQuery] = useState(
    () =>
      chromeHit?.data.query ??
      initialSection?.data.query ??
      "",
  );
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [items, setItems] = useState<AppListItem[]>(
    () => initialSection?.data.items ?? [],
  );
  const [selected, setSelected] = useState<AppListItem | null>(
    () => chromeHit?.data.selected ?? null,
  );
  const [detailFields, setDetailFields] = useState<StripeDetailField[]>(
    () => chromeHit?.data.detailFields ?? [],
  );
  const [detailRaw, setDetailRaw] = useState<Record<string, unknown> | null>(
    () => chromeHit?.data.detailRaw ?? null,
  );
  const [subscriptions, setSubscriptions] = useState<AppListItem[]>(
    () => chromeHit?.data.subscriptions ?? [],
  );
  const [prices, setPrices] = useState<AppListItem[]>(
    () => chromeHit?.data.prices ?? [],
  );
  const [balanceLines, setBalanceLines] = useState<StripeBalanceLine[]>(
    () => initialSection?.data.balanceLines ?? [],
  );
  const [status, setStatus] = useState<string | null>(
    () => initialSection?.data.status ?? null,
  );
  const [error, setError] = useState<string | null>(
    () => initialSection?.data.error ?? null,
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    () => initialSection?.data.lastSyncedAt ?? null,
  );
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createNotes, setCreateNotes] = useState("");

  const persistChrome = useCallback(
    (patch: Partial<StripeChromeCache>) => {
      const prev = peekViewCache<StripeChromeCache>(chromeKey)?.data;
      patchViewCache(chromeKey, {
        tab: patch.tab ?? prev?.tab ?? tab,
        page: patch.page ?? prev?.page ?? page,
        paymentSegment:
          patch.paymentSegment ?? prev?.paymentSegment ?? paymentSegment,
        query: patch.query ?? prev?.query ?? query,
        selected:
          patch.selected !== undefined
            ? patch.selected
            : (prev?.selected ?? selected),
        detailFields: patch.detailFields ?? prev?.detailFields ?? detailFields,
        detailRaw:
          patch.detailRaw !== undefined
            ? patch.detailRaw
            : (prev?.detailRaw ?? detailRaw),
        subscriptions:
          patch.subscriptions ?? prev?.subscriptions ?? subscriptions,
        prices: patch.prices ?? prev?.prices ?? prices,
      });
    },
    [
      chromeKey,
      detailFields,
      detailRaw,
      page,
      paymentSegment,
      prices,
      query,
      selected,
      subscriptions,
      tab,
    ],
  );

  const writeSection = useCallback(
    (
      scopeTab: TabId,
      scopeSegment: PaymentSegment,
      data: StripeSectionCache,
    ) => {
      writeViewCache(
        viewCacheKey(
          connectorId,
          workspaceId,
          sectionScope(scopeTab, scopeSegment),
        ),
        data,
      );
    },
    [workspaceId],
  );

  const applySection = useCallback((data: StripeSectionCache) => {
    setItems(data.items);
    setBalanceLines(data.balanceLines);
    setStatus(data.status);
    setError(data.error);
    setQuery(data.query);
    setLastSyncedAt(data.lastSyncedAt);
  }, []);

  const loadBalance = useCallback(async () => {
    const result = await runConnectorViewOperation({
      workspaceId,
      connectorId,
      operation: "retrieveBalance",
      input: {},
    });
    const lines = Array.isArray(result.data.lines)
      ? (result.data.lines as StripeBalanceLine[])
      : [];
    setBalanceLines(lines);
    return lines;
  }, [workspaceId]);

  const loadList = useCallback(
    async (opts: {
      tab: TabId;
      paymentSegment: PaymentSegment;
      searchQuery?: string;
    }) => {
      const resource = resourceForTab(opts.tab, opts.paymentSegment);
      if (!resource) return [] as AppListItem[];
      const needle = (opts.searchQuery ?? "").trim();
      const result = await runConnectorViewOperation({
        workspaceId,
        connectorId,
        operation: "listItems",
        input: {
          resource,
          ...(resource === "customers" && needle ? { query: needle } : {}),
        },
      });
      let parsed = (
        Array.isArray(result.data.items) ? result.data.items : []
      ).filter(
        (row): row is AppListItem =>
          Boolean(row && typeof row === "object" && typeof row.id === "string"),
      );
      if (needle && resource !== "customers") {
        const q = needle.toLowerCase();
        parsed = parsed.filter((item) =>
          `${item.title} ${item.subtitle ?? ""} ${item.meta ?? ""}`
            .toLowerCase()
            .includes(q),
        );
      }
      setItems(parsed);
      return parsed;
    },
    [workspaceId],
  );

  const refresh = useCallback(
    async (opts?: {
      force?: boolean;
      tab?: TabId;
      paymentSegment?: PaymentSegment;
      searchQuery?: string;
      attempt?: number;
    }) => {
      const nextTab = opts?.tab ?? tab;
      const nextSegment = opts?.paymentSegment ?? paymentSegment;
      const needle = opts?.searchQuery ?? query;
      const scope = sectionScope(nextTab, nextSegment);
      const sectionKey = viewCacheKey(connectorId, workspaceId, scope);

      if (!isConnected) {
        setItems([]);
        setBalanceLines([]);
        setStatus(null);
        setError("Connect Stripe in Connectors, then open this panel again.");
        return;
      }

      if (!opts?.force && !needle.trim()) {
        const hit = peekViewCache<StripeSectionCache>(sectionKey);
        if (hit?.fresh && hit.data.lastSyncedAt) {
          applySection(hit.data);
          persistChrome({
            tab: nextTab,
            paymentSegment: nextSegment,
            query: hit.data.query,
            page: "browse",
          });
          return;
        }
      }

      setSyncing(true);
      setError(null);
      try {
        if (nextTab === "overview") {
          const lines = await loadBalance();
          const syncedAt = new Date().toISOString();
          const nextStatus = lines.length
            ? null
            : "Balance loaded — no available or pending funds.";
          const section: StripeSectionCache = {
            items: [],
            balanceLines: lines,
            status: nextStatus,
            error: null,
            query: "",
            lastSyncedAt: syncedAt,
          };
          setLastSyncedAt(syncedAt);
          setStatus(nextStatus);
          setItems([]);
          writeSection(nextTab, nextSegment, section);
          persistChrome({
            tab: nextTab,
            paymentSegment: nextSegment,
            page: "browse",
            query: "",
          });
        } else {
          const parsed = await loadList({
            tab: nextTab,
            paymentSegment: nextSegment,
            searchQuery: needle,
          });
          const syncedAt = new Date().toISOString();
          const nextStatus = parsed.length
            ? null
            : needle.trim()
              ? "No matching results."
              : null;
          const section: StripeSectionCache = {
            items: parsed,
            balanceLines: [],
            status: nextStatus,
            error: null,
            query: needle,
            lastSyncedAt: syncedAt,
          };
          setLastSyncedAt(syncedAt);
          setStatus(nextStatus);
          writeSection(nextTab, nextSegment, section);
          persistChrome({
            tab: nextTab,
            paymentSegment: nextSegment,
            page: "browse",
            query: needle,
          });
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Could not load Stripe. Connect Stripe and try again.";
        setItems([]);
        setStatus(null);
        setError(message);
        invalidateViewCache(sectionKey);
        const attempt = opts?.attempt ?? 0;
        if (attempt < 2 && isNotConnectedError(message)) {
          if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = window.setTimeout(() => {
            void refresh({
              force: true,
              tab: nextTab,
              paymentSegment: nextSegment,
              searchQuery: needle,
              attempt: attempt + 1,
            });
          }, 1200 * (attempt + 1));
        }
      } finally {
        setSyncing(false);
      }
    },
    [
      applySection,
      isConnected,
      loadBalance,
      loadList,
      paymentSegment,
      persistChrome,
      query,
      tab,
      workspaceId,
      writeSection,
    ],
  );

  const openItem = useCallback(
    async (item: AppListItem, nextTab: TabId = tab) => {
      const resource = resourceForTab(nextTab, paymentSegment);
      if (!resource) return;

      setSelected(item);
      setError(null);
      setStatus(null);
      setSubscriptions([]);
      setPrices([]);
      setBusy(true);
      setPage("detail");
      setConnectorFocus({
        connectorId: "stripe",
        connectorLabel: connectorLabelForId("stripe"),
        itemId: item.id,
        itemTitle: item.title,
        itemKind: "other",
        openUrl: item.openUrl ?? undefined,
      });
      persistChrome({
        selected: item,
        page: "detail",
        subscriptions: [],
        prices: [],
      });

      try {
        let raw = item.raw ?? null;
        if (resource === "customers") {
          const result = await runConnectorViewOperation({
            workspaceId,
            connectorId,
            operation: "getItem",
            input: { resource: "customers", id: item.id },
          });
          const data = asRecord(result.data);
          const nested = data ? asRecord(data.data) ?? data : null;
          raw = nested ?? raw;
        }

        const fields = raw
          ? detailFieldsForResource(resource, raw)
          : [
              { label: "Name", value: item.title },
              ...(item.subtitle
                ? [{ label: "Details", value: item.subtitle }]
                : []),
            ];
        setDetailRaw(raw);
        setDetailFields(fields);
        persistChrome({ detailRaw: raw, detailFields: fields });

        if (resource === "customers") {
          try {
            const subResult = await runConnectorViewOperation({
              workspaceId,
              connectorId,
              operation: "listItems",
              input: { resource: "subscriptions", customer: item.id },
            });
            const subs = (
              Array.isArray(subResult.data.items) ? subResult.data.items : []
            ).filter(
              (row): row is AppListItem =>
                Boolean(
                  row && typeof row === "object" && typeof row.id === "string",
                ),
            );
            setSubscriptions(subs);
            persistChrome({ subscriptions: subs });
          } catch {
            setSubscriptions([]);
          }
        }

        if (resource === "products") {
          try {
            const priceResult = await runConnectorViewOperation({
              workspaceId,
              connectorId,
              operation: "listItems",
              input: { resource: "prices", product: item.id },
            });
            const nextPrices = (
              Array.isArray(priceResult.data.items) ? priceResult.data.items : []
            ).filter(
              (row): row is AppListItem =>
                Boolean(
                  row && typeof row === "object" && typeof row.id === "string",
                ),
            );
            setPrices(nextPrices);
            persistChrome({ prices: nextPrices });
          } catch {
            setPrices([]);
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not open this item.",
        );
        setDetailFields([
          { label: "Name", value: item.title },
          ...(item.subtitle
            ? [{ label: "Details", value: item.subtitle }]
            : []),
        ]);
      } finally {
        setBusy(false);
      }
    },
    [paymentSegment, persistChrome, tab, workspaceId],
  );

  const submitCreate = useCallback(async () => {
    if (!createName.trim() && !createEmail.trim()) {
      setError("Add a name or email for the customer.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await runConnectorViewOperation({
        workspaceId,
        connectorId,
        operation: "createCustomer",
        input: {
          name: createName.trim() || undefined,
          email: createEmail.trim() || undefined,
          phone: createPhone.trim() || undefined,
          description: createNotes.trim() || undefined,
        },
      });
      setCreateName("");
      setCreateEmail("");
      setCreatePhone("");
      setCreateNotes("");
      setPage("browse");
      setTab("customers");
      invalidateViewCache(viewCacheKey(connectorId, workspaceId, "customers"));
      persistChrome({ page: "browse", tab: "customers" });
      await refresh({ force: true, tab: "customers", searchQuery: "" });
      setStatus("Customer created.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create customer.",
      );
    } finally {
      setBusy(false);
    }
  }, [
    createEmail,
    createName,
    createNotes,
    createPhone,
    persistChrome,
    refresh,
    workspaceId,
  ]);

  const selectTab = useCallback(
    (next: TabId) => {
      setTab(next);
      setPage("browse");
      setSelected(null);
      setDetailFields([]);
      setDetailRaw(null);
      setSubscriptions([]);
      setPrices([]);
      setQuery("");
      persistChrome({
        tab: next,
        page: "browse",
        selected: null,
        detailFields: [],
        detailRaw: null,
        subscriptions: [],
        prices: [],
        query: "",
      });
      void refresh({ force: false, tab: next, searchQuery: "" });
    },
    [persistChrome, refresh],
  );

  useEffect(() => {
    void refresh({ force: false });
    return () => {
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount
  }, [workspaceId]);

  useEffect(() => {
    const was = wasConnectedRef.current;
    wasConnectedRef.current = isConnected;
    if (!was && isConnected) {
      invalidateConnectorViewCache(connectorId, workspaceId);
      void refresh({ force: true });
    }
    void connectionRevision;
  }, [connectionRevision, isConnected, refresh, workspaceId]);

  useEffect(() => {
    persistChrome({
      tab,
      page,
      paymentSegment,
      query,
      selected,
      detailFields,
      detailRaw,
      subscriptions,
      prices,
    });
  }, [
    detailFields,
    detailRaw,
    page,
    paymentSegment,
    persistChrome,
    prices,
    query,
    selected,
    subscriptions,
    tab,
  ]);

  useEffect(() => {
    const onBrowse = page === "browse" && tab !== "overview";
    const onCreate = page === "create";
    onToolbarChange?.({
      title:
        page === "detail"
          ? selected?.title ?? "Stripe"
          : page === "create"
            ? "New customer"
            : "Stripe",
      syncing: syncing || busy,
      busy,
      canGoBack: page !== "browse",
      backLabel: "Stripe",
      primaryLabel:
        page === "browse" && tab === "customers" && isConnected
          ? "New customer"
          : page === "create"
            ? "Save"
            : null,
      syncHint:
        page === "browse"
          ? syncing && !lastSyncedAt
            ? "Stripe · Syncing…"
            : lastSyncedAt
              ? `Stripe · Last synced ${formatSyncWhen(lastSyncedAt)}`
              : "Stripe"
          : null,
      driveChrome: onBrowse
        ? {
            query,
            onQueryChange: setQuery,
            onSearch: () => {
              void refresh({ force: true, searchQuery: query });
            },
            onOpenMobileSearch: () => setMobileSearchOpen(true),
            typeFilter: "all",
            sortMode: "modified-desc",
            onTypeFilter: () => undefined,
            onSortMode: () => undefined,
          }
        : null,
      onBack: () => {
        setPage("browse");
        setSelected(null);
        setDetailFields([]);
        setDetailRaw(null);
        setSubscriptions([]);
        setPrices([]);
        persistChrome({
          page: "browse",
          selected: null,
          detailFields: [],
          detailRaw: null,
          subscriptions: [],
          prices: [],
        });
        if (query.trim()) {
          setQuery("");
          setMobileSearchOpen(false);
          void refresh({ force: true, searchQuery: "" });
        }
      },
      onRefresh: () => {
        void refresh({ force: true });
      },
      onPrimary: onCreate
        ? () => {
            void submitCreate();
          }
        : page === "browse" && tab === "customers" && isConnected
          ? () => {
              setPage("create");
              setError(null);
              persistChrome({ page: "create" });
            }
          : null,
    });
  }, [
    busy,
    isConnected,
    lastSyncedAt,
    onToolbarChange,
    page,
    persistChrome,
    query,
    refresh,
    selected,
    submitCreate,
    syncing,
    tab,
  ]);

  const empty = emptyCopy(tab, paymentSegment);

  const detailEmail =
    tab === "customers"
      ? emailFromStripeRaw(detailRaw) ??
        emailFromStripeRaw(selected?.raw ?? null)
      : undefined;
  const detailImage =
    selected?.imageUrl ??
    (detailRaw ? pickStripeImageUrl(detailRaw) : undefined);

  function listLeading(item: AppListItem) {
    if (tab === "customers" || tab === "products") {
      return (
        <StripeEntityAvatar
          title={item.title}
          email={
            tab === "customers"
              ? emailFromStripeRaw(item.raw ?? null)
              : undefined
          }
          imageUrl={item.imageUrl}
          size={28}
          rounded={tab === "products" ? "soft" : "full"}
        />
      );
    }
    return (
      <ConnectorMark
        id="stripe"
        size="sm"
        className="!h-7 !w-7 !bg-transparent"
      />
    );
  }

  return (
    <WorkspacePanelFrame status={status} error={error}>
      {page === "browse" ? (
        <div className="relative flex min-h-0 flex-1 flex-col pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
          <div className="hidden shrink-0 overflow-x-auto lg:block border-b border-black/5 px-2 py-2 dark:border-white/10">
            <div className="flex min-w-max gap-1">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={cn(
                    "h-7 shrink-0 px-2.5 text-[11.5px] font-medium tracking-[-0.01em]",
                    SHELL_G3_RADIUS,
                    tab === item.id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <MobileFloatingNav activeId={tab} label="Stripe sections">
            {TABS.map((item) => (
              <button key={item.id} type="button" aria-current={tab === item.id ? "page" : undefined}
                onClick={() => selectTab(item.id)}
                className={cn("h-10 shrink-0 rounded-full px-4 text-[14px] font-medium transition-colors", tab === item.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60")}>
                {item.label}
              </button>
            ))}
          </MobileFloatingNav>

          {tab === "overview" ? (
            <div className="mobile-header-content min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <h2 className="text-[15px] font-medium tracking-tight">
                Account balance
              </h2>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Money available to pay out, and amounts still pending in Stripe.
              </p>
              {syncing && !balanceLines.length ? (
                <div className="mt-8 flex min-h-[12rem] flex-1 flex-col">
                  <ConnectorLoadingState
                    connectorId="stripe"
                    label="Loading Stripe"
                  />
                </div>
              ) : balanceLines.length ? (
                <div className="mt-4 space-y-3">
                  {balanceLines.map((line) => (
                    <div
                      key={line.currency}
                      className={cn(
                        "border border-black/5 px-3 py-3 dark:border-white/10",
                        SHELL_G3_RADIUS,
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[12px] font-medium text-foreground">
                          {line.currency}
                        </p>
                        <StatusPill label="Balance" />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            Available
                          </p>
                          <p className="mt-0.5 text-[16px] font-medium tabular-nums tracking-tight">
                            {line.available}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            Pending
                          </p>
                          <p className="mt-0.5 text-[16px] font-medium tabular-nums tracking-tight">
                            {line.pending}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <WorkspaceEmptyState
                  connectorId="stripe"
                  title="No balance to show"
                  body={
                    isConnected
                      ? "Your Stripe account may be empty, or balance isn't available yet."
                      : "Connect Stripe to see your balance."
                  }
                  actionLabel="Refresh"
                  syncing={syncing}
                  onAction={() => {
                    void refresh({ force: true, tab: "overview" });
                  }}
                />
              )}
            </div>
          ) : (
            <div className="mobile-header-content flex min-h-0 flex-1 flex-col overflow-hidden">
              {tab === "payments" ? (
                <div className="flex shrink-0 gap-1 border-b border-black/5 px-3 py-2 dark:border-white/10">
                  {(
                    [
                      { id: "charges", label: "Charges" },
                      { id: "payment_intents", label: "Payment intents" },
                    ] as const
                  ).map((seg) => (
                    <button
                      key={seg.id}
                      type="button"
                      onClick={() => {
                        setPaymentSegment(seg.id);
                        persistChrome({ paymentSegment: seg.id });
                        void refresh({
                          force: false,
                          paymentSegment: seg.id,
                        });
                      }}
                      className={cn(
                        "h-7 px-2.5 text-[11.5px] font-medium",
                        SHELL_G3_RADIUS,
                        paymentSegment === seg.id
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/70",
                      )}
                    >
                      {seg.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <ConnectorMobileSearchBar
                  open={mobileSearchOpen}
                  placeholder="Search Stripe"
                  value={query}
                  onChange={setQuery}
                  onSubmit={() => {
                    void refresh({ force: true, searchQuery: query });
                  }}
                  onDismiss={() => setMobileSearchOpen(false)}
                />
                {!items.length ? (
                  <WorkspaceEmptyState
                    connectorId="stripe"
                    title={
                      syncing
                        ? "Loading…"
                        : query.trim()
                          ? "No matches"
                          : empty.title
                    }
                    body={
                      syncing
                        ? "Fetching from Stripe."
                        : query.trim()
                          ? `Nothing matched “${query.trim()}”.`
                          : isConnected
                            ? empty.body
                            : "Connect Stripe in Connectors, then open this panel again."
                    }
                    actionLabel="Refresh"
                    syncing={syncing}
                    onAction={() => {
                      void refresh({ force: true });
                    }}
                  />
                ) : (
                  <div className="divide-y divide-black/5 dark:divide-white/10">
                    {items.map((item) => (
                      <WorkspaceListRow
                        key={item.id}
                        title={item.title}
                        subtitle={item.subtitle}
                        meta={item.meta}
                        onClick={() => {
                          void openItem(item);
                        }}
                        leading={listLeading(item)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {page === "detail" && selected ? (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {busy ? (
            <div className="mobile-header-content flex min-h-0 flex-1 flex-col">
              <ConnectorLoadingState
                connectorId="stripe"
                label={`Loading ${selected.title}`}
              />
            </div>
          ) : (
          <div className="mobile-header-content min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <div className="mb-4 flex items-start gap-3">
              {tab === "customers" || tab === "products" ? (
                <StripeEntityAvatar
                  title={selected.title}
                  email={detailEmail}
                  imageUrl={detailImage}
                  size={40}
                  rounded={tab === "products" ? "soft" : "full"}
                />
              ) : (
                <ConnectorMark
                  id="stripe"
                  size="md"
                  className="!h-10 !w-10 shrink-0 !bg-transparent"
                />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[15px] font-medium tracking-tight">
                  {selected.title}
                </h2>
                {selected.subtitle ? (
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {selected.subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            {tab === "products" && detailImage ? (
              <div
                className={cn(
                  "mb-4 overflow-hidden border border-black/5 dark:border-white/10",
                  SHELL_G3_RADIUS,
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detailImage}
                  alt=""
                  className="max-h-48 w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : null}
            <DetailRows fields={detailFields} />

            {tab === "customers" ? (
              <div className="mt-6">
                <h3 className="text-[13px] font-medium text-foreground">
                  Subscriptions
                </h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Active plans for this customer.
                </p>
                {subscriptions.length ? (
                  <div className="mt-3 divide-y divide-black/5 border-t border-black/5 dark:divide-white/10 dark:border-white/10">
                    {subscriptions.map((sub) => (
                      <div key={sub.id} className="px-0 py-3">
                        <p className="text-[13px] font-medium text-foreground">
                          {sub.title}
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                          {[sub.subtitle, sub.meta].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    No subscriptions for this customer.
                  </p>
                )}
              </div>
            ) : null}

            {tab === "products" ? (
              <div className="mt-6">
                <h3 className="text-[13px] font-medium text-foreground">
                  Prices
                </h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  How this product is billed.
                </p>
                {prices.length ? (
                  <div className="mt-3 divide-y divide-black/5 border-t border-black/5 dark:divide-white/10 dark:border-white/10">
                    {prices.map((price) => (
                      <div key={price.id} className="px-0 py-3">
                        <p className="text-[13px] font-medium text-foreground">
                          {price.title}
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                          {[price.subtitle, price.meta]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    No prices attached to this product.
                  </p>
                )}
              </div>
            ) : null}

            {detailRaw?.id && typeof detailRaw.id === "string" ? (
              <details className="mt-6">
                <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
                  Technical details
                </summary>
                <p className="mt-2 break-all text-[11px] text-muted-foreground">
                  ID: {detailRaw.id}
                </p>
              </details>
            ) : null}
          </div>
          )}
        </div>
      ) : null}

      {page === "create" ? (
        <div className="mobile-header-content min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <h2 className="text-[15px] font-medium tracking-tight">
            New customer
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Creates a customer in your connected Stripe account. Add a name or
            email (or both).
          </p>
          <div className="mt-4 space-y-3">
            <WorkspaceField
              label="Name"
              value={createName}
              onChange={setCreateName}
              placeholder="Acme Inc or Jane Doe"
            />
            <WorkspaceField
              label="Email"
              value={createEmail}
              onChange={setCreateEmail}
              placeholder="billing@example.com"
            />
            <WorkspaceField
              label="Phone"
              value={createPhone}
              onChange={setCreatePhone}
              placeholder="Optional"
            />
            <WorkspaceField
              label="Notes"
              value={createNotes}
              onChange={setCreateNotes}
              placeholder="Optional internal note"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void submitCreate();
            }}
            className={cn(
              "mt-5 inline-flex h-9 items-center justify-center border border-border bg-foreground px-4 text-[12px] font-medium text-background hover:opacity-90 disabled:opacity-50",
              SHELL_G3_RADIUS,
            )}
          >
            {busy ? "Saving…" : "Create customer"}
          </button>
        </div>
      ) : null}
    </WorkspacePanelFrame>
  );
}
