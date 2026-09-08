import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, Script } from "node:vm";
import { describe, it } from "node:test";
import ts from "typescript";
import type { Pin } from "../lib/types.ts";

// Exercise the production stores without loading Next's browser/auth runtime.
// Every harness has a fresh module cache, like a reload, and a controllable network.
const sourceRoot = new URL("../", import.meta.url);
const compiled = new Map<string, string>();
const PROFILE_A = "11111111-1111-4111-8111-111111111111";
const PROFILE_B = "22222222-2222-4222-8222-222222222222";
const contextFor = (actorId: string) => ({ actorId, workspaceId: "workspace-1" });
const gmail = { kind: "connector", id: "gmail", tier: "primary" } as const;
const calendar = { kind: "connector", id: "gcal", tier: "primary" } as const;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

class MemoryStorage {
  entries = new Map<string, string>();
  get length() { return this.entries.size; }
  key(index: number) { return [...this.entries.keys()][index] ?? null; }
  getItem(key: string) { return this.entries.get(key) ?? null; }
  setItem(key: string, value: string) { this.entries.set(key, String(value)); }
  removeItem(key: string) { this.entries.delete(key); }
}

async function flushMicrotasks() {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

type Row = Record<string, unknown>;
type QueryResult = { data: Row[] | Row | null; error: Error | null };
type QueryRecord = { table: string; operation: string; rows: Row[]; filters: unknown[] };

function createHarness(storage = new MemoryStorage()) {
  let now = 0;
  let timerId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const setTimeout = (callback: () => void, delay = 0) => {
    const id = ++timerId;
    timers.set(id, { at: now + delay, callback });
    return id;
  };
  const clearTimeout = (id: number) => { timers.delete(id); };
  const runFor = async (duration: number) => {
    const until = now + duration;
    await flushMicrotasks();
    for (let step = 0; step < 1000; step += 1) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= until)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) { now = until; return; }
      timers.delete(next[0]);
      now = next[1].at;
      next[1].callback();
      await flushMicrotasks();
    }
    assert.fail("Preference synchronization did not settle within 1000 timers");
  };

  const tables = new Map<string, Row[]>();
  const queries: QueryRecord[] = [];
  const controls: { table: string; operation: string; gate?: ReturnType<typeof deferred>; error?: Error }[] = [];

  class Query {
    table: string;
    operation = "select";
    payload: Row[] = [];
    filters: { operator: string; key: string; value: unknown }[] = [];
    single = false;
    conflict = "id";
    constructor(table: string) { this.table = table; }
    select() { return this; }
    insert(rows: Row | Row[]) { this.operation = "insert"; this.payload = clone(Array.isArray(rows) ? rows : [rows]); return this; }
    upsert(rows: Row | Row[], options?: { onConflict?: string }) { this.operation = "upsert"; this.payload = clone(Array.isArray(rows) ? rows : [rows]); this.conflict = options?.onConflict ?? "id"; return this; }
    delete() { this.operation = "delete"; return this; }
    eq(key: string, value: unknown) { this.filters.push({ operator: "eq", key, value }); return this; }
    neq(key: string, value: unknown) { this.filters.push({ operator: "neq", key, value }); return this; }
    in(key: string, value: unknown[]) { this.filters.push({ operator: "in", key, value }); return this; }
    not(key: string, operator: string, value: string) { assert.equal(operator, "in"); this.filters.push({ operator: "not-in", key, value: JSON.parse(`[${value.slice(1, -1)}]`) }); return this; }
    order() { return this; }
    maybeSingle() { this.single = true; return this; }
    matches(row: Row) {
      return this.filters.every(({ operator, key, value }) => {
        if (operator === "eq") return row[key] === value;
        if (operator === "neq") return row[key] !== value;
        assert.ok(Array.isArray(value));
        if (operator === "in") return value.includes(row[key]);
        return !value.includes(row[key]);
      });
    }
    async execute() {
      queries.push({ table: this.table, operation: this.operation, rows: clone(this.payload), filters: clone(this.filters) });
      const controlIndex = controls.findIndex((item) => item.table === this.table && item.operation === this.operation);
      const control = controlIndex < 0 ? undefined : controls.splice(controlIndex, 1)[0];
      const existing = tables.get(this.table) ?? [];
      // Capture the server response before delaying delivery to the client.
      let data: Row[] | Row | null = clone(existing.filter((row) => this.matches(row)));
      if (!control?.error) {
        if (this.operation === "delete") tables.set(this.table, existing.filter((row) => !this.matches(row)));
        if (this.operation === "insert") tables.set(this.table, [...existing, ...clone(this.payload)]);
        if (this.operation === "upsert") {
          const next = clone(existing);
          for (const row of this.payload) {
            const index = next.findIndex((item) => this.conflict.split(",").every((key) => item[key] === row[key]));
            if (index < 0) next.push(clone(row));
            else next[index] = clone(row);
          }
          tables.set(this.table, next);
        }
      }
      if (this.single) data = data[0] ?? null;
      if (control?.gate) await control.gate.promise;
      return { data, error: control?.error ?? null };
    }
    then(resolve: (result: QueryResult) => unknown, reject: (reason: unknown) => unknown) { return this.execute().then(resolve, reject); }
  }

  const noop = () => {};
  const subscribe = () => noop;
  const stubs: Record<string, object> = {
    "@/lib/data": { accountPresets: [] },
    "@/lib/data-backend": { isSupabaseConfigured: () => true },
    "@/lib/supabase/client": { createSupabaseBrowserClient: () => ({ from: (table: string) => new Query(table) }) },
    "@/lib/supabase/auth-store": { clearSupabaseAuthState: noop, subscribeSupabaseAuth: subscribe, subscribeSupabaseUserId: subscribe },
    "@/lib/supabase/auth-actions": { signOutSupabase: async () => {} },
    "@/lib/workspace-policy": { getMembersSnapshot: () => [], getPoliciesSnapshot: () => ({}), getPolicyStoreRevision: () => 0, replacePolicyStoreState: noop, resetPolicyStoreState: noop, subscribePolicyStore: subscribe },
    "@/lib/workspace-catalog": { getWorkspaceCatalogSnapshot: () => [] },
    "@/lib/api/chat-store": { resetChatStore: noop },
    "@/lib/api/space-entity-store": { resetSpaceEntityStore: noop },
    "@/lib/appearance": { clearAppearanceLocalState: noop },
    "@/lib/connector-connections-store": { clearConnectorConnectionsCache: noop, purgeLegacyConnectionStorage: noop },
    "@/lib/pin-display-prefs": { ensurePinKindVisible: noop },
  };
  const vm = createContext({
    window: { localStorage: storage, setTimeout, clearTimeout, addEventListener: noop, removeEventListener: noop },
    setTimeout, clearTimeout, queueMicrotask,
    console: { log: noop, info: noop, warn: noop, error: noop },
  });
  const cache = new Map<string, object>();
  const load = <T extends object>(id: string): T => {
    if (id in stubs) return stubs[id] as T;
    if (cache.has(id)) return cache.get(id) as T;
    assert.ok(id.startsWith("@/lib/"), `Unexpected production dependency: ${id}`);
    const filename = fileURLToPath(new URL(`${id.slice(2)}.ts`, sourceRoot));
    let output = compiled.get(filename);
    if (!output) {
      output = ts.transpileModule(readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
        fileName: filename,
      }).outputText;
      compiled.set(filename, output);
    }
    const loadedModule = { exports: {} };
    cache.set(id, loadedModule.exports);
    const execute = new Script(`(function(require, module, exports) {\n${output}\n})`, { filename }).runInContext(vm);
    execute(load, loadedModule, loadedModule.exports);
    return loadedModule.exports as T;
  };
  const session = load<typeof import("../lib/session.ts")>("@/lib/session");
  const mapper = load<typeof import("../lib/supabase/org-policy-mapper.ts")>("@/lib/supabase/org-policy-mapper");
  const sync = load<typeof import("../lib/api/org-policy-sync.ts")>("@/lib/api/org-policy-sync");
  const auth = load<typeof import("../lib/auth/sign-out.ts")>("@/lib/auth/sign-out");

  return {
    storage, session, mapper, sync, auth, tables, queries, runFor,
    pins: () => clone(session.getPinsSnapshot()),
    mutations: () => queries.filter((item) => item.table === "user_pins" && item.operation !== "select"),
    seedPins: (profileId: string, pins: Pin[]) => {
      tables.set("user_pins", [...(tables.get("user_pins") ?? []).filter((row) => row.profile_id !== profileId), ...pins.map((pin, index) => mapper.pinToRow(pin, profileId, index))]);
    },
    deferNext: (table: string, operation: string) => {
      const gate = deferred();
      controls.push({ table, operation, gate });
      return gate;
    },
    failNext: (table: string, operation: string) => { controls.push({ table, operation, error: new Error("Temporary network failure") }); },
  };
}

describe("pinned item persistence", () => {
  it("preserves an edit reverted while its earlier save is in flight across reload", async () => {
    const h = createHarness();
    h.session.bindPinsProfile(PROFILE_A);
    h.session.setStoredPin("connector", "gmail", "primary");
    const gate = h.deferNext("user_pins", "upsert");
    const pending = h.sync.syncUserPrefsToSupabase(contextFor(PROFILE_A));
    await flushMicrotasks();
    h.session.removeStoredPin("connector", "gmail");
    gate.release();
    await pending;
    assert.equal(h.session.arePinsDirty(), true);
    h.auth.clearLocalAuthState();
    const reloaded = createHarness(h.storage);
    reloaded.tables.set("user_pins", clone(h.tables.get("user_pins") ?? []));
    reloaded.session.bindPinsProfile(PROFILE_A);
    assert.equal(reloaded.session.arePinsDirty(), true);
    await reloaded.sync.hydrateUserPrefsFromRemote(contextFor(PROFILE_A));
    assert.deepEqual(reloaded.pins(), []);
    assert.deepEqual(reloaded.tables.get("user_pins"), []);
    assert.equal(reloaded.session.arePinsDirty(), false);
  });

  it("saves the local sidebar when the remote preference row is missing", async () => {
    const h = createHarness();
    h.session.bindPinsProfile(PROFILE_A);
    const sidebar = clone(h.session.getSidebarSnapshot());
    await h.sync.bootstrapSupabaseOrgPolicy(contextFor(PROFILE_A));
    const saved = h.tables.get("sidebar_layouts")?.[0];
    assert.deepEqual(saved?.main_nav, sidebar.main);
    assert.deepEqual(saved?.more_nav, sidebar.more);
    assert.equal(saved?.profile_id, PROFILE_A);
    assert.equal(h.mutations().length, 0);
  });

  it("restores existing remote pins with an empty local cache without deleting them", async () => {
    const h = createHarness();
    h.seedPins(PROFILE_A, [gmail]);
    h.session.bindPinsProfile(PROFILE_A);
    await h.sync.bootstrapSupabaseOrgPolicy(contextFor(PROFILE_A));
    await h.runFor(3000);
    assert.deepEqual(h.pins(), [gmail]);
    assert.equal(h.mutations().filter((query) => query.operation === "delete").length, 0);
    assert.equal(h.tables.get("user_pins")?.length, 1);
  });

  it("keeps local pins and re-pushes when remote pins are empty", async () => {
    const h = createHarness();
    h.session.bindPinsProfile(PROFILE_A);
    h.session.setStoredPin("connector", "gmail", "primary");
    h.session.markPinsSynced(h.session.getPinsLocalEpoch());
    assert.equal(h.session.arePinsDirty(), false);
    assert.deepEqual(h.tables.get("user_pins") ?? [], []);
    await h.sync.hydrateUserPrefsFromRemote(contextFor(PROFILE_A));
    await h.runFor(3000);
    assert.deepEqual(h.pins(), [gmail]);
    assert.equal(h.tables.get("user_pins")?.length, 1);
    assert.equal(h.session.arePinsDirty(), false);
  });

  it("preserves unsynced pin and unpin changes across sign-out binding and reload", () => {
    const h = createHarness();
    h.session.bindPinsProfile(PROFILE_A);
    h.session.setStoredPin("connector", "gmail", "primary");
    h.session.bindPinsProfile(null);
    assert.deepEqual(h.pins(), []);
    h.session.bindPinsProfile(PROFILE_A);
    assert.deepEqual(h.pins(), [gmail]);
    assert.equal(h.session.arePinsDirty(), true);
    h.session.markPinsSynced(h.session.getPinsLocalEpoch());
    h.session.removeStoredPin("connector", "gmail");
    h.session.bindPinsProfile(null);
    const reloaded = createHarness(h.storage);
    reloaded.session.bindPinsProfile(PROFILE_A);
    assert.deepEqual(reloaded.pins(), []);
    assert.equal(reloaded.session.arePinsDirty(), true, "an intentional unpin must remain distinguishable from an empty new cache");
  });

  it("retains account-scoped caches during auth cleanup and clears the active pins on sign-out", async () => {
    const h = createHarness();
    h.session.bindPinsProfile(PROFILE_A);
    h.session.setStoredPin("connector", "gmail", "primary");
    h.session.markPinsSynced(h.session.getPinsLocalEpoch());
    const pinKey = `courier-pins:${PROFILE_A}`;
    const syncedKey = `courier-pins-synced-fp:${PROFILE_A}`;
    const cached = h.storage.getItem(pinKey);
    const synced = h.storage.getItem(syncedKey);
    h.storage.setItem("courier-pins", "[]");
    h.auth.clearLocalAuthState();
    assert.equal(h.storage.getItem(pinKey), cached);
    assert.equal(h.storage.getItem(syncedKey), synced);
    assert.equal(h.storage.getItem("courier-pins"), null);
    await h.auth.signOutAccount();
    assert.deepEqual(h.pins(), []);
    h.session.bindPinsProfile(PROFILE_A);
    assert.deepEqual(h.pins(), [gmail]);
  });

  it("does not apply a delayed account A hydration to account B", async () => {
    const h = createHarness();
    h.session.bindPinsProfile(PROFILE_A);
    h.seedPins(PROFILE_A, [gmail]);
    const gate = h.deferNext("user_pins", "select");
    const pending = h.sync.hydrateUserPrefsFromRemote(contextFor(PROFILE_A));
    await flushMicrotasks();
    h.session.bindPinsProfile(PROFILE_B);
    h.session.setStoredPin("connector", "gcal", "primary");
    gate.release();
    await pending;
    await h.runFor(3000);
    assert.deepEqual(h.pins(), [calendar]);
    assert.equal(h.session.arePinsDirty(), true);
    assert.equal(h.mutations().length, 0, "old account hydration must not push the new account's pins");
  });

  it("does not mark account B pins synced when an account A save finishes", async () => {
    const h = createHarness();
    h.session.bindPinsProfile(PROFILE_A);
    h.session.setStoredPin("connector", "gmail", "primary");
    const gate = h.deferNext("user_pins", "upsert");
    const pending = h.sync.syncUserPrefsToSupabase(contextFor(PROFILE_A));
    await flushMicrotasks();
    h.session.bindPinsProfile(PROFILE_B);
    h.session.setStoredPin("connector", "gcal", "primary");
    gate.release();
    await pending;
    assert.deepEqual(h.pins(), [calendar]);
    assert.equal(h.session.arePinsDirty(), true);
    assert.equal(h.storage.getItem(`courier-pins-synced-fp:${PROFILE_B}`), null);
  });

  it("ignores a stale remote read after a newer local pin has already saved", async () => {
    const h = createHarness();
    h.session.bindPinsProfile(PROFILE_A);
    h.session.replacePinsState([gmail]);
    h.seedPins(PROFILE_A, [gmail]);
    const gate = h.deferNext("user_pins", "select");
    const pending = h.sync.hydrateUserPrefsFromRemote(contextFor(PROFILE_A));
    await flushMicrotasks();
    h.session.setStoredPin("connector", "gcal", "primary");
    await h.sync.syncUserPrefsToSupabase(contextFor(PROFILE_A));
    assert.equal(h.session.arePinsDirty(), false);
    gate.release();
    await pending;
    await h.runFor(3000);
    assert.deepEqual(h.pins(), [calendar, gmail]);
    assert.deepEqual(h.tables.get("user_pins")?.map((row) => row.target_id).sort(), ["gcal", "gmail"]);
  });

  it("cancels a blocked synchronization retry when its subscription is disposed", async () => {
    const h = createHarness();
    h.session.bindPinsProfile(PROFILE_A);
    h.session.setStoredPin("connector", "gmail", "primary");
    const gate = h.deferNext("user_pins", "upsert");
    const pending = h.sync.syncUserPrefsToSupabase(contextFor(PROFILE_A));
    await flushMicrotasks();
    const stop = h.sync.startUserPrefsRemoteSync(contextFor(PROFILE_A));
    h.session.setStoredPin("connector", "gcal", "primary");
    await h.runFor(0);
    stop();
    gate.release();
    await pending;
    const writesAfterDispose = h.mutations().length;
    await h.runFor(3000);
    assert.equal(h.mutations().length, writesAfterDispose);
    assert.equal(h.session.arePinsDirty(), true, "the newer unsent pin must remain dirty for the next subscription");
  });

  it("can save a pin after a remote preference read fails", async () => {
    const h = createHarness();
    h.session.bindPinsProfile(PROFILE_A);
    h.failNext("user_pins", "select");
    await assert.rejects(h.sync.hydrateUserPrefsFromRemote(contextFor(PROFILE_A)), /Temporary network failure/);
    const stop = h.sync.startUserPrefsRemoteSync(contextFor(PROFILE_A));
    h.session.setStoredPin("connector", "gmail", "primary");
    await h.runFor(3000);
    stop();
    assert.equal(h.session.arePinsDirty(), false);
    assert.ok(h.mutations().some((query) => query.operation === "upsert"));
    assert.equal(h.tables.get("user_pins")?.[0]?.target_id, "gmail");
  });
});
