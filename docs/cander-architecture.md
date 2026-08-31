# Cander — Full Application & Intelligence Architecture

This document maps how the Cander app is structured and how its AI thinks, plans, remembers, and responds. Use it as the baseline for refactors.

**Related docs:** `[ai-orchestrator.md](./ai-orchestrator.md)` (orchestrator-specific detail and flags)

---

## Table of contents

1. [Mental model](#1-mental-model)
2. [Application shell & navigation](#2-application-shell--navigation)
3. [Data & persistence layer](#3-data--persistence-layer)
4. [Chat UI & message model](#4-chat-ui--message-model)
5. [AI intelligence architecture](#5-ai-intelligence-architecture)
6. [Build, Research, Browser paths](#6-build-research-browser-special-paths)
7. [Configuration flags](#7-configuration-flags)
8. [Typical flows (examples)](#8-typical-flows-examples)
9. [Key files index](#9-key-files-index)
10. [Known limits & refactor touchpoints](#10-known-limits--refactor-touchpoints)

---



## 1. Mental model

Cander is a **Next.js web app** wrapped in **native shells** (Capacitor iOS/Android, Electron macOS). Almost all product UI lives in the web bundle (`https://cander.app`). The shell adds Dock presence, keyboard handling, in-panel browser surfaces, and Apple Foundation Models access.

**Intelligence is not one model call.** It is a **router + orchestrator stack**:

1. User types in **Composer** → `sendMessage` in `AppProvider`
2. Message goes to `fetchPrivateAiReply` → `runAssistantTurn`
3. Router picks **local FM orchestrator** (Mac/iOS, simple turns) or **cloud Edge V2 orchestrator** (vision, complex work, no FM)
4. Orchestrator runs **tools** (web search, browser read, build, nav, etc.), assembles **memory + context**, validates grounding, returns answer
5. UI shows **Thinking** phases mid-turn, then **typewriter-reveals** the final text (not true token streaming today)

---



## 2. Application shell & navigation



### 2.1 Provider stack

```
app/(app)/page.tsx
  └─ AppShell
       ├─ AuthProvider          — Supabase session, onboarding gate
       ├─ AppProvider           — ~3,900 lines: all navigation + sendMessage
       └─ SpaceDataProvider     — API bundle + Supabase sync loops
```


| Provider   | File                                   | Responsibility                               |
| ---------- | -------------------------------------- | -------------------------------------------- |
| Auth       | `components/app/AuthProvider.tsx`      | Session, onboarding pending, member hydrate  |
| App        | `components/app/AppProvider.tsx`       | Views, threads, projects, panels, AI send    |
| Space data | `components/app/SpaceDataProvider.tsx` | `createApiBundle()`, starts entity/chat sync |




### 2.2 Boot sequence

1. `sessionReady` false → `SessionBootScreen` ("Loading your account")
2. Not signed in / onboarding pending → `OnboardingFlow`
3. Workspace not in catalog → `SessionBootScreen` ("Loading workspace")
4. → `AuthenticatedShell` (sidebar + main content)

Auth touches: `lib/supabase/auth-store.ts`, `lib/session.ts`, `middleware.ts`

### 2.3 Views (`CourierView`)


| View       | When                              | Main component    |
| ---------- | --------------------------------- | ----------------- |
| `chat`     | Home chat, or chat inside a space | `ChatColumn`      |
| `space`    | Space dashboard / project panel   | `SpaceChatLayout` |
| `settings` | Settings                          | `SettingsView`    |
| `browser`  | Standalone browser mode           | `BrowserLayout`   |
| `recents`  | Recent threads                    | `RecentsView`     |
| `shared`   | Shared threads                    | `SharedPanel`     |


Routing lives in `AppShell` → `CourierMain()` (`components/shell/AppShell.tsx`).

### 2.4 Spaces vs projects vs connectors

**Spaces** = product areas in nav:

- `work` — tasks, briefing, connectors
- `build` — apps/sites/automations
- `research` — explore / papers / browser-heavy work
- `connectors` — third-party integrations

**Projects** = durable work units inside a workspace (`lib/types.ts` → `Project`). Each has a home space (`build`, `research`, etc.).

**Persistent dock chats** use stable thread IDs:

- Space chat: `t-space-{workspace}-{space}`
- Project chat: `t-project-{workspace}-{project}`

See `lib/persistent-chat.ts`.

### 2.5 Layout modes

**Desktop:** `SpaceChatLayout` — resizable chat column + space panel (`SplitMainLayout`, `ContextPanel`).

**Mobile:** `MobileMenuScaffold` (slide menu) + `MobileContentPager` (chat ↔ panel). Native browser surfaces hide when panel is off-screen.

**Panel modes:** `collapsed | split | wide | immersive` — control right-panel width and whether chat is visible.

### 2.6 Right panel contents

`ContextPanel` hosts space-specific panels:

- Build → preview, browser, publish
- Research → browser tabs
- Work → briefing, connectors
- Connectors → installed connector UIs

In-project browser: `ProjectBrowserPanel` + `BrowserSurfaceHost` (native WKWebView / Electron WebContentsView / PWA iframe).

### 2.7 Mobile shell

Capacitor iOS/Android and narrow web share:

- `lib/mobile-shell.ts` — keyboard inset (`--keyboard-inset`), viewport lock
- `MobileAppChrome` — top bar, space/project navigation
- Production apps load `https://cander.app` (no native rebuild needed for web-only changes)

Electron desktop loads the same URL via `desktop/src/main.js` (`CANDER_URL`, default `https://cander.app`).

---



## 3. Data & persistence layer



### 3.1 Dual backend

`lib/data-backend.ts`:

- **local** — mock data when no Supabase env vars
- **supabase** — production when `NEXT_PUBLIC_SUPABASE_URL` + anon key are set

API facades in `lib/api/index.ts` → `createApiBundle(mode)`.


| API        | Local                       | Supabase                        |
| ---------- | --------------------------- | ------------------------------- |
| entities   | `space-entity-api.local.ts` | `space-entity-api.supabase.ts`  |
| chat       | `chat-api.local.ts`         | `chat-api.supabase.ts`          |
| connectors | `connector-api.ts`          | `connector-api.supabase.ts`     |
| build      | `build-runtime-api.ts`      | `build-runtime-api.supabase.ts` |
| browser    | `browser-api.ts`            | `browser-api.supabase.ts`       |




### 3.2 Client-side stores


| Store                    | File                                            | Storage                                      | Contents                                  |
| ------------------------ | ----------------------------------------------- | -------------------------------------------- | ----------------------------------------- |
| Chat threads             | `lib/api/chat-store.ts`                         | `localStorage` `courier-threads-v1:{userId}` | Full UI transcript                        |
| Space entities           | `lib/api/space-entity-store.ts`                 | `localStorage`                               | Projects, sources, briefings, deployments |
| Session prefs            | `lib/session.ts`                                | `localStorage`                               | Workspace, actor, pins, theme             |
| Workspace catalog        | `lib/workspace-catalog.ts`                      | `localStorage`                               | Custom workspaces                         |
| Org policy               | `lib/workspace-policy.ts`                       | `localStorage`                               | Members, policies                         |
| Project browser sessions | `lib/project-browser-session.ts`                | `localStorage`                               | Tab state per project                     |
| AI runtime mode          | `lib/ai/runtime/mode-store.ts`                  | `localStorage`                               | `auto / local / cloud`                    |
| Thread task state        | `lib/ai/task-state.ts`                          | **In-memory Map**                            | Active goal, step, domains                |
| Conversation delta       | `lib/ai/turn-environment/conversation-store.ts` | **In-memory Map**                            | Entity/topic state for local FM           |


`AppProvider` subscribes via `useSyncExternalStore` to chat-store and entity-store.

Image data URLs are stripped before chat localStorage persist (`lib/chat-store-persist.ts`, `lib/safe-local-storage.ts`).

### 3.3 Supabase sync pattern

Started in `SpaceDataProvider` when signed in + Supabase backend:

```
bootstrapSupabaseSession (lib/import/bootstrap-supabase.ts)
  ├─ bootstrapSupabaseEntities
  ├─ bootstrapSupabaseOrgPolicy
  ├─ bootstrapSupabaseConnectors
  ├─ bootstrapSupabaseBrowser
  ├─ bootstrapSupabaseProjectBrowser
  └─ bootstrapSupabaseChat

Ongoing loops (each: debounced push + realtime pull):
  startSupabaseEntitySync      → lib/api/entity-sync.ts
  startSupabaseOrgPolicySync   → lib/api/org-policy-sync.ts
  startSupabaseConnectorSync   → lib/api/connector-sync.ts
  startSupabaseBrowserSync     → lib/api/browser-sync.ts
  startSupabaseProjectBrowserSync → lib/api/project-browser-sync.ts
  startChatRemoteSync          → lib/api/chat-sync.ts (600ms debounce push)
  startChatRealtimePull        → lib/api/chat-sync.ts
```

**Critical chat sync rules** (`lib/api/chat-sync.ts`):

- Push **skipped** while assistant message is `pending` or `streaming`
- Hydrate **merges** remote without clobbering in-flight AI placeholders
- Keeps local pending AI placeholders and threads not yet on server



### 3.4 Postgres tables (high level)

Migrations under `supabase/migrations/`:


| Area                | Tables / columns                                                       |
| ------------------- | ---------------------------------------------------------------------- |
| Tenancy             | workspaces, profiles, org members                                      |
| Entities            | projects, sources, briefing_items, deployments, attachments            |
| UI chat             | `threads`, `messages`                                                  |
| Private AI          | `ai_chats`, `ai_chat_messages`, `ai_chat_turns`, `ai_chat_turn_events` |
| Memory              | `ai_chat_memory_index`, `ai_chats.conversation_state`                  |
| Computer            | `computer_sessions`                                                    |
| Agent orchestration | `ai_chat_search_sessions`, turn idempotency                            |




### 3.5 API routes (Next.js)

There are **no Next.js** `/api/chat` **routes**. Chat and AI go through Supabase Edge Functions and direct client → Postgres access.

Next.js `app/api/*` handles:

- Billing (Stripe)
- Org/workspace invites
- Account delete, onboarding finish
- Computer sandbox sessions (`app/api/computer/*`)

---



## 4. Chat UI & message model



### 4.1 Component tree

```
Composer (input, attachments, voice)
  → ChatColumn (scroll, landing, transcript)
    → ChatMessage / UserMessage / AssistantMessage
      → MessageBlocks, ThinkingIndicator, ClarificationCard, Citations
```


| Component        | File                                       |
| ---------------- | ------------------------------------------ |
| Composer         | `components/shell/Composer.tsx`            |
| Chat column      | `components/shell/ChatColumn.tsx`          |
| User bubble      | `components/chat/UserMessage.tsx`          |
| Assistant bubble | `components/chat/AssistantMessage.tsx`     |
| Thinking UI      | `components/chat/ThinkingIndicator.tsx`    |
| Clarification    | `components/chat/ClarificationCard.tsx`    |
| Session summary  | `components/chat/SessionSummaryBubble.tsx` |




### 4.2 Thread & message types

```typescript
// lib/types.ts
type Thread = {
  id: string;
  title: string;
  workspaceId: string;
  projectId?: string;      // linked project
  spaceId?: SpaceId;       // UI lens (may differ from project home)
  updatedAt: string;
  snippet: string;
  messages: Message[];
  shared?: boolean;
  persistent?: boolean;    // dock chat — resume don't recreate
  sessionSummary?: string | null;  // UI-only summary on close
  createdBy?: string;
  aiChatId?: string;       // links to Supabase ai_chats (cloud path)
};

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  at?: string;
  status?: "pending" | "streaming" | "complete" | "error";
  activity?: { phase: string; startedAt: number };  // Thinking UI
  blocks?: MessageBlock[];   // images, code, tool calls, clarifications
  citations?: Citation[];
};
```



### 4.3 Two parallel chat IDs


| ID         | Scope               | Used for                                                      |
| ---------- | ------------------- | ------------------------------------------------------------- |
| `threadId` | UI + localStorage   | Composer history, task state, conversation-store              |
| `aiChatId` | Supabase `ai_chats` | Cloud orchestrator history, working memory, cross-chat memory |


Local FM turns often **never write** `ai_chats` — they use thread transcript + in-memory conversation state. Cloud turns **create/link** `aiChatId` and persist turns server-side.

### 4.4 Thread lifecycle


| Action          | Handler                           | Behavior                             |
| --------------- | --------------------------------- | ------------------------------------ |
| New chat        | `newChat()`                       | Clears thread, `view=chat`, no space |
| Space dock chat | `openSpaceChat(space)`            | Resumes `findPersistentSpaceThread`  |
| Project chat    | `openProject` / `openProjectChat` | Links thread to `projectId`          |
| Close dock chat | session close                     | Writes `sessionSummary` (UI only)    |
| Recents         | `RecentsView`                     | Lists threads from chat-store        |


---



## 5. AI intelligence architecture



### 5.1 End-to-end flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ USER                                                                     │
│   Composer.onSend → ChatColumn → AppProvider.sendMessage()              │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │ 1. classifyTurn / inferIntent  │  (may navigate away)
                    │ 2. Optimistic user + pending   │
                    │    assistant in chat-store     │
                    │ 3. kickLiveAi()                │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │ fetchPrivateAiReply            │
                    │   lib/ai/send-thread-reply.ts  │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │ runAssistantTurn               │
                    │   lib/ai/runtime/agent-turn.ts │
                    └───────────────┬───────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              │ isAgentOrchestratorEnabled()?              │
              └─────────────────────┬─────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │ YES                      │                          │ NO
         ▼                          ▼                          ▼
 shouldUseLocalTurnOrchestrator   Cloud path              Legacy client
         │                          │                     agent loop
         ▼                          ▼
 runLocalTurnOrchestrator    browser preflight →
 (Apple FM + client tools)   runOrchestratedTurn
         │                          │
         │                          ▼
         │                   ai-agent-api.ts
         │                          │
         │                          ▼
         │                   Edge: ai-agent/index.ts
         │                          │
         │                          ▼
         │                   runTurnOrchestratorV2
         │                   (controller loop)
         │
         └──────────────► Response → typewriterReveal → chat-store
```



### 5.2 `sendMessage` — pre-AI steps

`AppProvider.sendMessage` (`components/app/AppProvider.tsx`):

1. **Normalize attachments** — images → `data:image/` blocks; files → inline text in AI payload
2. `classifyTurn` — chat vs navigation vs action
3. `inferIntent` — may route to a space dashboard instead of chatting
4. `useLiveAi` **gate** — signed-in + chat/build/skill/research kinds get real AI
5. **Create messages** — user bubble + assistant with `status: "pending"`
6. `setThreads` — upsert in chat-store
7. `kickLiveAi` — async `fetchPrivateAiReply`

On complete:

- Patch assistant message (`streaming` → `complete`)
- Attach citations, blocks, tool results
- Save `aiChatId` on thread (cloud path; skips `local-*` ids)
- Debounced Supabase thread sync



### 5.3 Router: local vs cloud

**Decision:** `shouldUseLocalTurnOrchestrator()` in `lib/ai/runtime/on-device-routing.ts`


| Condition                                                | Route                         |
| -------------------------------------------------------- | ----------------------------- |
| Images attached                                          | **Cloud**                     |
| No Foundation Models on device                           | **Cloud**                     |
| User mode = `cloud`                                      | **Cloud**                     |
| `cloud_work` domain active                               | **Cloud**                     |
| Task type: research, execution, release, reasoning_heavy | **Cloud**                     |
| Browser surface deixis ("this page", "what's on screen") | **Local**                     |
| Live info ("weather", "news today")                      | **Local** (pre-run web tools) |
| Routine build (flagged)                                  | **Local** build path          |
| Normal conversational chat + FM available                | **Local**                     |


**Product matrix:**


| Host         | Normal chat                | Vision / complex           |
| ------------ | -------------------------- | -------------------------- |
| Mac/iOS + FM | `runLocalTurnOrchestrator` | `runOrchestratedTurn` → V2 |
| Web / no FM  | Cloud V2                   | Cloud V2                   |


Runtime mode: `lib/ai/runtime/mode-store.ts` — user can force `local` (privacy) or `cloud`.

Classifier: `lib/ai/intelligence/classifier.ts` — task types, preferred route (`on_device | pcc | cander_cloud`).

### 5.4 Local orchestrator (Apple-first)

**File:** `lib/ai/orchestrator/local-turn-orchestrator.ts`

**Principle:** The small FM model does **not** orchestrate Cander — the **runtime compiler** does. FM is used for synthesis and optional tool-call rounds (max 2).

#### Turn environment compiler

**Files:** `lib/ai/turn-environment/`*

Before every FM call, `compileTurnProfile()` produces a `TurnProfile`:

```typescript
type TurnProfile = {
  toolMode: "disallowed" | "allowed" | "required";
  tools: ToolCard[];           // ≤5 tools exposed to FM
  preRunTasks: PreRunTask[];   // run BEFORE FM (parallel, timeouts)
  budgets: { maxToolRounds; maxPromptChars; concurrency; toolTimeoutMs; ... };
  contextPacket: ContextPacket;
  clarificationRequired?: boolean;
};
```

**Four execution paths:**

1. **Simple** — Context → FM → answer
2. **Obvious retrieval** — Pre-run tools in parallel → normalize evidence → FM synthesis
3. **Ambiguous** — `clarificationRequired` → FM asks smallest allowed question → user resumes
4. **Model-chosen tool** — FM picks from ≤5 tool cards → execute → FM answer (max 2 rounds)

Key rules:

- Budget profiles: `on_device_small`, `on_device_large`, `pcc`
- ≤5 tools exposed (prefer 0–3); domain gating via `resolveAllowedToolsForTurn`
- Pre-run bypasses FM for live-info / URL / browser deixis
- Provenance-first citations through normalize → synthesis → Sources UI



#### Conversation delta (multi-turn state)

```
New user message
  → deterministic delta (regex/heuristics)
  → if low confidence: tiny FM semantic delta (classify only)
  → ConversationDelta
  → merge with previous ConversationTurnState
  → capability compiler
```

**IR:** `lib/ai/turn-environment/conversation-types.ts`

- Entities/topics/evidence: `ACTIVE | AVAILABLE | EXPIRED`
- Enables "the second one", "is that still true?", pronoun resolution

**Storage:** `lib/ai/turn-environment/conversation-store.ts` — in-memory per `threadId`, **not persisted to DB** on local path.

Delta pipeline: `resolveConversationDelta` → `applyConversationDelta`

#### Local FM prompt assembly

`buildFmPrompt()` pulls from:


| Source              | File                                              |
| ------------------- | ------------------------------------------------- |
| Workspace inventory | `lib/ai/runtime/on-device-workspace-cache.ts`     |
| Transcript          | prior messages from request                       |
| Evidence            | normalized web search results                     |
| Task state          | `lib/ai/task-state.ts`                            |
| Browser context     | active tab URL/title                              |
| Instructions        | `lib/ai/runtime/cander-on-device-instructions.ts` |
| Context budget      | `lib/ai/intelligence/context-budget.ts`           |


Generation: `lib/ai/runtime/native/fm-generate.ts` → Apple Foundation Models (Electron preload / Capacitor plugin).

Structured output: `@Generable` when bridge supports it; else JSON-in-prose fallback.

#### Post-processing


| Step                | File                                            |
| ------------------- | ----------------------------------------------- |
| Complete answer     | `lib/ai/orchestrator/ensure-complete-answer.ts` |
| Grounding validator | `lib/ai/orchestrator/grounding-validator.ts`    |
| Citations           | `lib/ai/orchestrator/collect-citations.ts`      |
| Evidence normalize  | `lib/ai/turn-environment/normalize.ts`          |




#### Progress events

`ToolExecutionBus` (`lib/ai/orchestrator/tool-execution-bus.ts`) → `onProgress` → `message.activity` → `ThinkingIndicator`.

Phases: `generating`, `searching`, `reading`, `checking`, `building`, `updating` (`lib/ai/turn-activity.ts`).

### 5.5 Cloud orchestrator V2 (Edge)


| Layer       | File                                                  |
| ----------- | ----------------------------------------------------- |
| Client shim | `lib/ai/orchestrator/run-turn.ts`                     |
| API client  | `lib/api/ai-agent-api.ts`                             |
| Edge entry  | `supabase/functions/ai-agent/index.ts`                |
| V2 loop     | `supabase/functions/_shared/agent/v2/orchestrator.ts` |
| V1 fallback | `supabase/functions/_shared/agent/orchestrator.ts`    |




#### Client responsibilities

1. Create/link `aiChatId` via `lib/api/ai-chat-api.ts`
2. `setAiChatContext` — workspace/project refs
3. **Browser preflight** (`lib/ai/orchestrator/browser-context-preflight.ts`) — read active browser tab client-side before cloud turn
4. `runAgentTurnStream` (NDJSON) or fallback `runAgentTurn`
5. Execute `clientActions` from `paused_for_client`
6. Resume turn with `clientActionResults`



#### V2 controller loop (server)

```
memory retrieval
  → controller decision (structured JSON)
  → web_search
  → web_open (SSRF-safe)
  → evidence briefing
  → answer model
  → validate (retrieve_more / regenerate)
  → buildMemoryDelta → conversation_state + memory_index
```

**Principle:** The model does **not** decide if Cander has internet. The orchestrator owns capabilities and iteration.

Models (env): `OLLAMA_CONTROLLER_MODEL`, `OLLAMA_ANSWER_MODEL`

Web: Exa via Edge `web-search` / `web-open`

#### Streaming protocol

NDJSON events: `turn.started`, `status`, `turn.completed`, `turn.paused`, `turn.failed`, `turn.cancelled`

Client maps `status` → Thinking UI. Answer text arrives complete, then typewriter-revealed.

### 5.6 Tools & domains

**Registry:** `lib/ai/tools/registry.ts`

**Domain gating:** `lib/ai/tools/domains.ts` (Edge mirror: `supabase/functions/_shared/tool-domains.ts`)


| Domain          | Example tools                                                      |
| --------------- | ------------------------------------------------------------------ |
| `web`           | `web.search`, `web.open`, `web.read`, `web.research`               |
| `browser`       | `browser.current.get_context`, `capture_viewport`, `get_selection` |
| `projects`      | `project.create`, `project.open`                                   |
| `navigation`    | `nav.open`, `panel.open`, `panel.close`                            |
| `build`         | `build.spec.patch`, `build.page.add`, `build.publish`, …           |
| `health`        | `health.query`, `health.workouts`                                  |
| `computer`      | `computer.browser.*`, `computer.files.*`, `computer.exec`          |
| `cloud_work`    | `create_work_task`, `check_work_task`                              |
| `clarification` | `ui.ask_clarification`, `ui.confirm`                               |
| `knowledge`     | `knowledge.search`                                                 |
| `search`        | `workspace.search`                                                 |


**Resolver:** `resolveAllowedToolsForTurn()` — conversation-first; expands from regex + `ThreadTaskState.allowedDomains`.

**Execution:** `lib/ai/runtime/tools.ts` → `executeAuthorizedTool()`

- Build: `lib/ai/build/tool-executors.ts`
- Health: `lib/ai/health/tool-executors.ts`
- App actions: `lib/ai/runtime/app-actions.ts` (nav, project, clarification)
- Web: Edge proxy via `lib/api/web-search-client.ts`, `web-open-client.ts`



### 5.7 Planning & task state

**Per-thread task state** (`lib/ai/task-state.ts`):

```typescript
type ThreadTaskState = {
  threadId: string;
  goal: string;
  step: string;
  status: "idle" | "awaiting_clarification" | "running" | "completed" | "failed";
  allowedDomains?: ToolDomain[];
  pendingClarification?: {
    title: string;
    resumeTool?: string;
    resumeArguments?: Record<string, unknown>;
  };
  workTaskId?: string | null;
  facts: Record<string, unknown>;
  lastToolResults?: Array<{ name: string; ok: boolean; detail: string }>;
  updatedAt: string;
};
```

**In-memory only** — lost on page reload.

Used for: domain unlocks, clarification resume, durable work task linking.

**Build TurnPlan** (flagged): `lib/ai/build/turn-plan.ts`, `routine-mutation.ts`

**Durable cloud work:** `lib/ai/intelligence/durable-tasks.ts`

### 5.8 Memory — how Cander remembers

Memory is **layered** and **just-in-time retrieved**.

#### Layer 1: Recent verbatim transcript

- UI messages in `Thread.messages`
- Last ~20 turns to orchestrator
- Cloud: 45% token budget for recent (`lib/ai/orchestrator/context-builder.ts`)

**Persists:** localStorage + Supabase `messages`

#### Layer 2: Structured working memory

- Cloud: `ai_chats.conversation_state` JSON
- Active entity/topic, entity lists, recent lists, facts, decisions
- Updated via `buildMemoryDelta` each V2 turn

**Persists:** cloud path only, tied to `aiChatId`

#### Layer 3: In-chat history search

- Keyword retrieval over older messages in same chat
- Triggered by pronouns, ordinals, temporal callbacks
- `lib/ai/orchestrator/history-retriever.ts`



#### Layer 4: Cross-chat / Space memory

- `ai_chat_memory_index` — Postgres FTS
- Scoped: workspace → project → owner

**Future:** pgvector semantic search

#### Layer 5: Live evidence

- Web search, opened pages, knowledge search, tool outputs
- `lib/ai/orchestrator/evidence.ts`, `turn-environment/normalize.ts`



#### Local-only memory


| Mechanism            | Persistence       | Purpose                                            |
| -------------------- | ----------------- | -------------------------------------------------- |
| `conversation-store` | In-memory         | Entity/topic ACTIVE/EXPIRED                        |
| `task-state`         | In-memory         | Goal, step, domains                                |
| `sessionSummary`     | Thread field      | UI blurb on dock close — **not primary AI memory** |
| Workspace inventory  | Rebuilt each turn | Projects, members, snippets                        |




#### Local vs cloud memory summary


|                | Local FM path                 | Cloud V2 path            |
| -------------- | ----------------------------- | ------------------------ |
| Transcript     | chat-store + Supabase threads | + ai_chat_messages       |
| Working memory | conversation-store (RAM)      | conversation_state (DB)  |
| Cross-chat     | Not indexed                   | memory_index FTS         |
| Task state     | RAM                           | Partially via work tasks |




#### Condensation

When context exceeds limits, cloud may condense older turns. UI shows `__CHAT_CONDENSED__` system event. Flag: `condensationOccurred`.

### 5.9 Context assembly


| Source                     | Local               | Cloud            |
| -------------------------- | ------------------- | ---------------- |
| User message + attachments | ✓                   | ✓                |
| Prior transcript           | ✓                   | ✓ + retrieval    |
| Workspace/project refs     | inventory block     | context packet   |
| Active browser tab         | preflight / pre-run | client preflight |
| Images                     | → forces cloud      | vision pipeline  |
| File text                  | inlined             | inlined          |
| Composer refs              | `[ref: ...]` prefix | same             |
| Task state                 | prompt injection    | ✓                |
| Evidence from tools        | pre-run             | controller loop  |


**Attachments:** `lib/ai/attachment-context.ts`, `lib/ai/vision-input.ts`

**Browser deixis:** `lib/browser-context/routing.ts`

### 5.10 Streaming & presentation UX

**Mid-turn (real):**

- Local: `ToolExecutionBus` → `onProgress` → `message.activity`
- Cloud: NDJSON `status` events
- UI: `ThinkingIndicator`

**Answer text (simulated):**

- Model returns complete text
- `typewriterReveal()` (`lib/ai/typewriter.ts`)
- Status: `pending` → `streaming` → `complete`

**Not implemented:** token-level streaming from FM/Ollama into bubble.

### 5.11 Clarification & paused turns

- Tool: `ui.ask_clarification` → `ClarificationCard`
- `pausedForUser: true` in turn result
- `ThreadTaskState.status = awaiting_clarification`
- User answers → resume with `resumeTool` / `resumeArguments`

Files: `lib/ai/clarification/schema.ts`, `store.ts`, `components/chat/ClarificationCard.tsx`

### 5.12 Legacy paths


| Path                     | When                                  |
| ------------------------ | ------------------------------------- |
| Legacy client agent loop | `NEXT_PUBLIC_AI_AGENT_ORCHESTRATOR=0` |
| Edge V1                  | `AI_ORCHESTRATOR_V2=0`                |
| `chat-send` Edge         | Simple rule-based stubs               |
| `ai-chat` send_message   | Ollama bridge (older)                 |


Production default: agent orchestrator ON + V2 ON.

---



## 6. Build, Research, Browser special paths



### 6.1 Build

- Projects: preview URLs, build specs, component library
- Tools domain: `build.*` when `requiresBuildCapabilities`
- Local routine path: `NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR=1`
- Files: `lib/ai/build/*`

Build is a **capability set** on the same pipeline, not a separate agent.

### 6.2 Research

- Default browser session seeds web tab (`makeWebTab()` → `about:blank`)
- Heavy web research; often routes cloud for deep task types



### 6.3 Browser & computer


| Capability               | Mechanism                                     |
| ------------------------ | --------------------------------------------- |
| In-panel browser         | `BrowserSurfaceHost` + platform adapter       |
| Browser context for AI   | `browser.current.*` tools                     |
| Agent computer           | `computer.*` → Vercel sandbox                 |
| Cloud + Electron browser | Client preflight reads page before cloud turn |


Browser adapters: `lib/browser-surface/` (electron, capacitor, web-pwa)

---



## 7. Configuration flags


| Flag                                | Default | Effect                                    |
| ----------------------------------- | ------- | ----------------------------------------- |
| `NEXT_PUBLIC_AI_AGENT_ORCHESTRATOR` | on      | Edge agent vs legacy client loop          |
| `AI_ORCHESTRATOR_V2`                | on      | V2 controller vs V1                       |
| `NEXT_PUBLIC_AI_ORCHESTRATOR_V2`    | on      | Client requests `orchestratorVersion: v2` |
| `NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR` | off     | Build TurnPlan local path                 |
| `WEB_RESEARCH_PROVIDER`             | exa     | Web search backend                        |
| `OLLAMA_CONTROLLER_MODEL`           | —       | Cloud plan model                          |
| `OLLAMA_ANSWER_MODEL`               | —       | Cloud answer model                        |
| `NEXT_PUBLIC_DATA_BACKEND`          | auto    | local vs supabase                         |
| User runtime mode                   | auto    | local / cloud override                    |


Set any orchestrator flag to `0`/`false`/`off` to roll back that layer.

---



## 8. Typical flows (examples)



### A: "What's the weather in Austin?" (Mac, FM available)

1. Composer → `sendMessage` → pending assistant
2. `shouldUseLocalTurnOrchestrator` → true (`liveInfoHint`)
3. `compileTurnProfile` → preRunTask: `web.search`
4. Execute `web.search` → Exa via Edge proxy
5. Normalize evidence → FM synthesis
6. `typewriterReveal` → complete
7. chat-store persist; Supabase thread sync (not ai_chats)



### B: Photo + "what is this?"

1. Images → cloud only
2. `runOrchestratedTurn` → create `aiChatId` if needed
3. Edge V2 → vision → answer
4. `aiChatId` saved on Thread



### C: "Create a build project called Landing Page"

1. Local or cloud depending on FM + complexity
2. `projects` domain unlocked
3. `project.create` via app-actions
4. Entity store + UI navigation update



### D: "What does this page say?" (browser in right panel)

1. `refersToActiveBrowserSurface` → local (or preflight if cloud)
2. `browser.current.get_context`
3. Answer grounded in page text



### E: User returns next day to same project chat

**Remembered:**

- Transcript in chat-store + Supabase (if synced)
- Project context from entity store

**Not remembered (local path without cloud aiChatId):**

- In-memory task state
- In-memory conversation-store
- sessionSummary is UI-only

**Cloud path additionally:**

- `conversation_state`
- Cross-chat memory index

---



## 9. Key files index



### UI & send


| File                                   | Role                        |
| -------------------------------------- | --------------------------- |
| `components/shell/Composer.tsx`        | Input, attachments, voice   |
| `components/shell/ChatColumn.tsx`      | Transcript, send wiring     |
| `components/app/AppProvider.tsx`       | `sendMessage`, `kickLiveAi` |
| `components/chat/AssistantMessage.tsx` | Render assistant + Thinking |




### AI entry & routing


| File                                  | Role                    |
| ------------------------------------- | ----------------------- |
| `lib/ai/send-thread-reply.ts`         | Client AI entry         |
| `lib/ai/runtime/agent-turn.ts`        | Main router             |
| `lib/ai/runtime/on-device-routing.ts` | Local vs cloud decision |
| `lib/ai/orchestrator/flags.ts`        | Feature flags           |




### Local orchestrator


| File                                             | Role                 |
| ------------------------------------------------ | -------------------- |
| `lib/ai/orchestrator/local-turn-orchestrator.ts` | Apple FM turn loop   |
| `lib/ai/turn-environment/compile.ts`             | TurnProfile compiler |
| `lib/ai/turn-environment/conversation-store.ts`  | Multi-turn state     |
| `lib/ai/runtime/native/fm-generate.ts`           | FM bridge            |




### Cloud orchestrator


| File                                                  | Role              |
| ----------------------------------------------------- | ----------------- |
| `lib/ai/orchestrator/run-turn.ts`                     | Cloud client shim |
| `lib/api/ai-agent-api.ts`                             | Edge API client   |
| `supabase/functions/ai-agent/index.ts`                | Edge entry        |
| `supabase/functions/_shared/agent/v2/orchestrator.ts` | V2 loop           |




### Tools & planning


| File                            | Role                  |
| ------------------------------- | --------------------- |
| `lib/ai/tools/registry.ts`      | Tool definitions      |
| `lib/ai/tools/domains.ts`       | Domain gating         |
| `lib/ai/runtime/tools.ts`       | Tool execution        |
| `lib/ai/runtime/app-actions.ts` | Nav/project handlers  |
| `lib/ai/task-state.ts`          | Per-thread task state |




### Memory & context


| File                                          | Role                      |
| --------------------------------------------- | ------------------------- |
| `lib/api/chat-store.ts`                       | UI thread store           |
| `lib/api/chat-sync.ts`                        | Supabase thread sync      |
| `lib/chat-store-persist.ts`                   | Safe localStorage persist |
| `lib/ai/orchestrator/context-builder.ts`      | Cloud context packet      |
| `lib/ai/orchestrator/memory-retrieval.ts`     | Memory retrieval          |
| `lib/ai/runtime/on-device-workspace-cache.ts` | Local inventory           |
| `lib/ai/attachment-context.ts`                | Attachments for AI        |




### Edge functions


| Function     | Role                  |
| ------------ | --------------------- |
| `ai-agent`   | Main orchestrator     |
| `ai-chat`    | Private AI chat CRUD  |
| `web-search` | Exa search            |
| `web-open`   | Page read             |
| `chat-send`  | Legacy simple replies |




### Tests

```bash
npm run test:orchestrator
```

Includes: `local-orchestrator.test.ts`, `orchestrator-v2.test.ts`, `turn-environment.test.ts`, `trajectory-eval.test.ts`, `chat-store-persist.test.ts`, `composer-mobile.test.ts`, `browser-surface.test.ts`

---



## 10. Known limits & refactor touchpoints

1. **Split memory models** — UI `threadId` vs `aiChatId` vs in-memory task/conversation state. Local path doesn't persist working memory to DB.
2. **Task state is ephemeral** — reload loses goal/step/domain unlocks.
3. **No true token streaming** — typewriter is cosmetic; Thinking phases are real.
4. **Domain gating duplication** — client `domains.ts` must mirror Edge `tool-domains.ts`.
5. **Browser context split** — local preflight vs cloud preflight vs native surfaces.
6. **chat-store localStorage** — size-limited; image bytes stripped on persist.
7. **Cross-chat memory** — keyword FTS only, no embeddings yet.
8. **Legacy paths** — three stacks (legacy client, V1, V2) increase confusion.
9. **Build orchestrator** — partially flagged/separate from main pipeline.
10. **sessionSummary** — UI-only; not integrated into AI memory layers.
11. **Condensation** — cloud-only; local path has no equivalent long-context strategy.
12. **Intent routing in sendMessage** — keyword intent can navigate away from chat before AI runs; easy to surprise users.

---



## Appendix: Supabase Edge function map

```
supabase/functions/
├── ai-agent/          ← canonical turn orchestrator (V2 default)
├── ai-chat/           ← private chat CRUD + Ollama bridge
├── chat-send/         ← legacy simple replies
├── web-search/        ← Exa search
├── web-open/          ← page fetch/read
├── briefing-sync/     ← briefing items
├── build-publish/     ← publish preview URLs
└── _shared/agent/     ← orchestrator implementation
    ├── v2/orchestrator.ts
    ├── orchestrator.ts (V1)
    ├── context-builder.ts
    └── ...
```

---



## Appendix: Native shell map

```
mobile/                 ← Capacitor iOS/Android
├── capacitor.config.ts ← server.url = CANDER_URL || cander.app
├── ios/App/            ← Swift plugins (browser, health, FM bridge)
└── android/

desktop/                ← Electron macOS
├── src/main.js         ← loads cander.app, browser IPC, speech bridge
├── src/browser-surface.js
└── release/            ← DMG builds (e.g. Cander-0.1.5-arm64.dmg)
```

Web bundle changes deploy via Vercel; native rebuild only needed for Swift/Electron shell or Capacitor plugin changes.