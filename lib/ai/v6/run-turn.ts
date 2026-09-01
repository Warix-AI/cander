/**
 * V6 runTurn — single orchestration path.
 *
 * USER → SURFACE → CONTEXT GATE → CONTEXT RESOLUTION → APPLE PARSE
 * → PARSE RECONCILIATION → NORMALIZE → POLICY → REQUEST GRAPH
 * → EXECUTION → VERIFY → CONFLICT → DERIVE → USER COVERAGE → RENDER → MEMORY
 */

import type {
  AgentTurnOptions,
  AgentTurnResult,
} from "@/lib/ai/runtime/agent-turn";
import type { AiGenerateRequest } from "@/lib/ai/runtime/types";

import { computeUserCoverage } from "./coverage/user-coverage.ts";
import { contextGate } from "./context/gate.ts";
import {
  buildRetrievalScope,
  resolveContext,
} from "./context/resolve.ts";
import { executeGraph, type ExecuteDeps } from "./execute/runner.ts";
import {
  cloudSynthesis,
  needsCloudSynthesis,
} from "./execute/providers/cloud-synthesis.ts";
import { evalArithmeticText } from "./execute/providers/deterministic.ts";
import { executeWeb } from "./execute/providers/web.ts";
import { buildRequestGraph } from "./graph/build.ts";
import {
  buildMemoryDelta,
  commitMemoryDelta,
  loadMemoryDelta,
} from "./memory/commit.ts";
import { normalizeRequests } from "./normalize/canonicalize.ts";
import {
  appleParse,
  heuristicParse,
  repairParse,
  type GenerateFn,
} from "./parse/apple-parse.ts";
import {
  attachMissingSpanIds,
  computeParseCoverage,
} from "./parse/reconcile.ts";
import { renderApple } from "./render/apple.ts";
import { citationsFromEvidence } from "./render/citations.ts";
import { renderDeterministic } from "./render/deterministic.ts";
import { selectRenderer } from "./render/select.ts";
import {
  extractFirstUrl,
  isPureArithmetic,
  isSimpleConversational,
  surfacePrepass,
} from "./surface/prepass.ts";
import { logV6Trace } from "./trace/turn-trace.ts";
import type {
  AnswerBundle,
  ContextEntity,
  ParseOutcome,
  TurnSpec,
  TurnTrace,
} from "./types.ts";

export type RunTurnOptions = AgentTurnOptions & {
  generate?: GenerateFn;
  executeDeps?: Partial<ExecuteDeps>;
  /** Force heuristic parse (tests) */
  useHeuristicOnly?: boolean;
  /** Inject entities for reference resolution */
  activeEntities?: ContextEntity[];
  invokeCloud?: Parameters<typeof cloudSynthesis>[0]["invoke"];
};

export type V6TurnResult = AgentTurnResult & {
  v6Trace?: TurnTrace;
};

function finalizeTrace(trace: TurnTrace): TurnTrace {
  trace.webPlannedCount = (trace.sourcePlans || []).filter(
    (p) => p.strategy === "web" || p.strategy === "hybrid",
  ).length;
  trace.webExecutedCount = (trace.requestResults || []).filter((r) =>
    (trace.sourcePlans || []).some(
      // approximate: verified/unresolved web results counted via evidence later
      () => false,
    ),
  ).length;
  // Prefer counting from evidence sourceType when present on results path
  const webResults = (trace.requestResults || []).filter((r) =>
    Boolean(r.evidenceIds?.some((id) => id.startsWith("ev_web_"))),
  );
  trace.webExecutedCount = webResults.length;
  trace.evidenceCount = trace.evidenceCount ?? 0;
  return trace;
}

export async function runTurn(
  request: AiGenerateRequest,
  opts?: RunTurnOptions,
): Promise<V6TurnResult> {
  const report = opts?.onProgress ?? (() => {});
  const text = (request.content || "").trim();
  const hasImages = Boolean(request.images?.length);

  const trace = {
    input: text,
  } as TurnTrace;

  report({ phase: "thinking", label: "Thinking", detail: "Surface prepass" });

  // —— FAST PATHS ——
  if (isPureArithmetic(text)) {
    const n = evalArithmeticText(text);
    const surface = surfacePrepass(text);
    trace.surfaceExpectation = surface;
    trace.fastPath = "arithmetic";
    trace.renderer = "deterministic";
    trace.parseOutcome = {
      type: "ready",
      spec: {
        requests: [{ id: "r1", kind: "calculate", surfaceSpanIds: ["span_1"] }],
        response: { ordering: "request_order", detail: "short" },
      },
    };
    trace.contextGate = {
      currentThread: true,
      searchMemory: false,
      searchPriorChats: false,
      inspectKnowledgeBaseMetadata: false,
    };
    trace.contextResolution = {
      currentThreadHits: 0,
      memoryHits: 0,
      priorChatHits: 0,
      kbHints: 0,
    };
    trace.normalization = [];
    trace.sourcePlans = [];
    trace.executionWaves = [["r1"]];
    trace.requestResults = [
      {
        requestId: "r1",
        status: n == null ? "unresolved" : "verified",
        value: n,
        evidenceIds: [],
      },
    ];
    trace.userCoverage = {
      surfaceSpans: [
        {
          spanId: "span_1",
          status: n == null ? "unresolved" : "answered",
          requestIds: ["r1"],
        },
      ],
      complete: n != null,
    };
    trace.webPlannedCount = 0;
    trace.webExecutedCount = 0;
    trace.evidenceCount = 0;
    logV6Trace(trace);
    return {
      content:
        n == null
          ? "I couldn’t evaluate that expression."
          : String(n),
      runtime: "apple-local",
      offline: true,
      condensationOccurred: false,
      aiChatId: request.aiChatId,
      v6Trace: trace,
    };
  }

  if (isSimpleConversational(text) && !hasImages) {
    const surface = surfacePrepass(text);
    trace.surfaceExpectation = surface;
    trace.fastPath = "conversational";
    trace.renderer = "apple";
    let content = "Happy to help — what would you like to know?";
    if (/thanks|thank you/i.test(text)) content = "You’re welcome.";
    else if (/^(hi|hello|hey)\b/i.test(text)) content = "Hi — how can I help?";
    else if (/bye|good night/i.test(text)) content = "Goodbye.";
    logV6Trace({
      ...trace,
      contextGate: {
        currentThread: true,
        searchMemory: false,
        searchPriorChats: false,
        inspectKnowledgeBaseMetadata: false,
      },
      contextResolution: {
        currentThreadHits: 0,
        memoryHits: 0,
        priorChatHits: 0,
        kbHints: 0,
      },
      parseOutcome: {
        type: "ready",
        spec: {
          requests: [],
          response: { ordering: "synthesized", detail: "short" },
        },
      },
      normalization: [],
      sourcePlans: [],
      executionWaves: [],
      requestResults: [],
      userCoverage: { surfaceSpans: [], complete: true },
    } as TurnTrace);
    return {
      content,
      runtime: "apple-local",
      offline: true,
      condensationOccurred: false,
      aiChatId: request.aiChatId,
    };
  }

  // —— SURFACE ——
  const surface = surfacePrepass(text);
  trace.surfaceExpectation = surface;

  // Explicit URL fast path (still goes through light verify/render)
  const url = extractFirstUrl(text);
  if (url && /^https?:\/\/\S+$/i.test(text.trim().replace(/\?$/, ""))) {
    trace.fastPath = "url";
    const web = await executeWeb(
      {
        request: {
          id: "r1",
          kind: "summarize",
          subject: { type: "named", value: url },
          property: "page",
          surfaceSpanIds: ["span_1"],
        },
        property: { status: "unmatched" },
      },
      {
        readUrl: opts?.executeDeps?.readUrl,
        url,
        fetchWeb: async () => ({
          text: `Contents of ${url}`,
          title: url,
          url,
          authority: 80,
        }),
      },
    );
    const content = String(web.result.value || web.evidence[0]?.excerpt || url);
    trace.renderer = "deterministic";
    const urlTrace: TurnTrace = {
      ...trace,
      contextGate: {
        currentThread: true,
        searchMemory: false,
        searchPriorChats: false,
        inspectKnowledgeBaseMetadata: false,
      },
      contextResolution: {
        currentThreadHits: 0,
        memoryHits: 0,
        priorChatHits: 0,
        kbHints: 0,
      },
      parseOutcome: {
        type: "ready",
        spec: {
          requests: [
            {
              id: "r1",
              kind: "summarize",
              surfaceSpanIds: ["span_1"],
            },
          ],
          response: { ordering: "request_order", detail: "short" },
        },
      },
      normalization: [],
      sourcePlans: [
        { strategy: "web", reason: "url_fast_path", matchedPolicy: false },
      ],
      executionWaves: [["r1"]],
      requestResults: [web.result],
      userCoverage: {
        surfaceSpans: [
          { spanId: "span_1", status: "answered", requestIds: ["r1"] },
        ],
        complete: true,
      },
      webPlannedCount: 1,
      webExecutedCount: web.evidence.length ? 1 : 0,
      evidenceCount: web.evidence.length,
    };
    logV6Trace(urlTrace);
    return {
      content,
      runtime: "apple-local",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId,
      citations: citationsFromEvidence(web.evidence),
      v6Trace: urlTrace,
    };
  }

  // —— CONTEXT GATE ——
  report({ phase: "thinking", label: "Thinking", detail: "Context" });
  const gate = contextGate(text, surface);
  trace.contextGate = gate;

  const scope = buildRetrievalScope(request);
  const priorMem = loadMemoryDelta(request.threadId);
  const entities: ContextEntity[] = [
    ...(opts?.activeEntities || []),
    ...(priorMem?.activeEntities || []),
  ];

  const { packet, ambiguousClarification } = await resolveContext({
    request,
    scope,
    gate,
    activeEntities: entities,
    loadMemory: opts?.executeDeps
      ? async () => opts.executeDeps?.packet?.relevantMemories || []
      : undefined,
  });

  // Seed follow-up calculation into memory hints for heuristic parse
  if (priorMem?.activeCalculation?.perItem != null) {
    packet.relevantMemories = [
      ...packet.relevantMemories,
      {
        id: "active_calc",
        text: `calculation perItem=${priorMem.activeCalculation.perItem} unit=${priorMem.activeCalculation.unit || ""} subject=${priorMem.activeCalculation.subject}`,
        score: 1,
      },
    ];
  }

  // Allow test packet override via executeDeps.packet merge
  if (opts?.executeDeps?.packet) {
    Object.assign(packet, opts.executeDeps.packet);
  }

  trace.contextResolution = {
    currentThreadHits: packet.recentTurns.length,
    memoryHits: packet.relevantMemories.length,
    priorChatHits: packet.priorChatMatches.length,
    kbHints: packet.knowledgeBaseHints.length,
  };

  if (ambiguousClarification) {
    const outcome: ParseOutcome = {
      type: "clarification_required",
      ambiguity: ambiguousClarification,
    };
    trace.parseOutcome = outcome;
    trace.failureStage = "parse";
    trace.renderer = "deterministic";
    trace.normalization = [];
    trace.sourcePlans = [];
    trace.executionWaves = [];
    trace.requestResults = [];
    trace.userCoverage = computeUserCoverage({
      surface,
      spec: null,
      results: [],
      parseOutcome: outcome,
    });
    logV6Trace(trace);
    return {
      content: ambiguousClarification.question,
      runtime: "apple-local",
      offline: true,
      condensationOccurred: false,
      aiChatId: request.aiChatId,
      pausedForUser: true,
      v6Trace: {
        ...trace,
        webPlannedCount: 0,
        webExecutedCount: 0,
        evidenceCount: 0,
      } as TurnTrace,
    };
  }

  // —— APPLE PARSE ——
  report({ phase: "thinking", label: "Thinking", detail: "Parsing request" });
  let generate = opts?.generate;
  if (!generate && !opts?.useHeuristicOnly) {
    try {
      const { getFoundationModelsAvailability } = await import(
        "@/lib/ai/runtime/native/foundation-models"
      );
      const { generateFmTurn } = await import(
        "@/lib/ai/runtime/native/fm-generate"
      );
      const fmAvail = await getFoundationModelsAvailability();
      if (fmAvail.available) {
        generate = async (prompt, instructions) => {
          const fm = await generateFmTurn({ prompt, instructions });
          return fm.text;
        };
      }
    } catch {
      generate = undefined;
    }
  }

  let { outcome } = await appleParse({
    text,
    surface,
    packet,
    generate,
    useHeuristicOnly: opts?.useHeuristicOnly ?? !generate,
  });

  // —— PARSE RECONCILIATION ——
  let spec: TurnSpec | null =
    outcome.type === "ready" ? attachMissingSpanIds(outcome.spec, surface) : null;
  if (spec && outcome.type === "ready") {
    outcome = { type: "ready", spec };
  }

  let coverage = computeParseCoverage(surface, outcome);
  if (
    outcome.type === "ready" &&
    coverage.status === "incomplete" &&
    coverage.uncoveredSpanIds.length
  ) {
    report({
      phase: "thinking",
      label: "Thinking",
      detail: "Repairing parse coverage",
    });
    const repaired = await repairParse({
      text,
      surface,
      packet,
      prior: outcome.spec,
      uncoveredSpanIds: coverage.uncoveredSpanIds,
      generate: opts?.useHeuristicOnly ? undefined : generate,
    });
    outcome = { type: "ready", spec: attachMissingSpanIds(repaired, surface) };
    spec = outcome.spec;
    coverage = computeParseCoverage(surface, outcome);
  }

  trace.parseOutcome = outcome;
  trace.parseCoverage = coverage;

  if (outcome.type === "clarification_required") {
    trace.failureStage = "parse";
    trace.renderer = "deterministic";
    trace.normalization = [];
    trace.sourcePlans = [];
    trace.executionWaves = [];
    trace.requestResults = [];
    trace.userCoverage = computeUserCoverage({
      surface,
      spec: null,
      results: [],
      parseOutcome: outcome,
    });
    logV6Trace(trace);
    return {
      content: outcome.ambiguity.question,
      runtime: "apple-local",
      offline: true,
      condensationOccurred: false,
      aiChatId: request.aiChatId,
      pausedForUser: true,
      v6Trace: {
        ...trace,
        webPlannedCount: 0,
        webExecutedCount: 0,
        evidenceCount: 0,
      } as TurnTrace,
    };
  }

  if (coverage.status === "incomplete") {
    trace.failureStage = "parse_coverage";
    const uncovered = coverage.uncoveredSpanIds
      .map((id) => surface.spans.find((s) => s.id === id)?.text || id)
      .join("; ");
    const partialSpec = outcome.spec;
    // Fail closed: do not silently proceed as complete — still answer covered parts
    // but mark failure and include uncovered notice.
    spec = partialSpec;
  }

  // —— NORMALIZE + POLICY + GRAPH ——
  report({ phase: "thinking", label: "Thinking", detail: "Routing sources" });
  const normalized = normalizeRequests(outcome.spec.requests);
  trace.normalization = normalized.map((n) => ({
    requestId: n.request.id,
    rawProperty: n.property.raw,
    canonicalKey: n.property.canonicalKey,
    status: n.property.status,
  }));

  const { graph, sourcePlans } = buildRequestGraph(normalized);
  trace.sourcePlans = sourcePlans;

  // —— EXECUTE ——
  report({ phase: "tool", label: "Gathering evidence", detail: "Executing requests" });
  const execDeps: ExecuteDeps = {
    packet,
    // Stubs for unit tests / local offline; production uses live Exa.
    allowWebStub: process.env.NODE_ENV !== "production",
    ...opts?.executeDeps,
  };

  const executed = await executeGraph({
    graph,
    normalized,
    sourcePlans,
    deps: execDeps,
  });

  trace.executionWaves = executed.waves;
  trace.requestResults = executed.results;
  trace.evidenceCount = executed.evidence.length;
  trace.webPlannedCount = sourcePlans.filter(
    (p) => p.strategy === "web" || p.strategy === "hybrid",
  ).length;
  trace.webExecutedCount = executed.evidence.filter(
    (e) => e.sourceType === "web",
  ).length;

  // —— USER COVERAGE ——
  const userCoverage = computeUserCoverage({
    surface,
    spec: outcome.spec,
    results: executed.results,
    parseOutcome: outcome,
  });
  trace.userCoverage = userCoverage;

  if (coverage.status === "incomplete") {
    userCoverage.complete = false;
  }

  const bundle: AnswerBundle = {
    spec: outcome.spec,
    surfaceExpectation: surface,
    results: executed.results,
    evidence: executed.evidence,
    coverage: userCoverage,
  };

  // —— RENDER ——
  report({ phase: "generating", label: "Writing answer" });
  const forceCloud = needsCloudSynthesis({
    hasImages,
    hasResearch: outcome.spec.requests.some((r) => r.kind === "research"),
    detailDeep: outcome.spec.response.detail === "deep",
    fmUnavailable: !generate,
  });

  const renderer = selectRenderer({
    spec: outcome.spec,
    bundle,
    forceCloud,
    hasImages,
  });
  trace.renderer = renderer;

  let content = "";
  if (renderer === "cloud") {
    const synth = await cloudSynthesis({
      request,
      bundle,
      synthesisPrompt: [
        `User: ${text}`,
        `Resolved results:`,
        ...executed.results.map(
          (r) => `${r.requestId} [${r.status}]: ${String(r.value ?? r.reason)}`,
        ),
        coverage.status === "incomplete"
          ? `UNCOVERED ASKS: ${coverage.uncoveredSpanIds.join(", ")}`
          : "",
      ].join("\n"),
      invoke: opts?.invokeCloud,
    });
    content = synth.content;
  } else if (renderer === "apple") {
    content = await renderApple(bundle, generate || undefined);
  } else {
    content = renderDeterministic(bundle);
  }

  if (coverage.status === "incomplete") {
    const uncovered = coverage.uncoveredSpanIds
      .map((id) => surface.spans.find((s) => s.id === id)?.text || id)
      .filter(Boolean);
    if (uncovered.length) {
      content = `${content}\n\nI may not have fully covered: ${uncovered.join("; ")}.`;
      trace.failureStage = trace.failureStage || "parse_coverage";
    }
  }

  // —— MEMORY ——
  const delta = buildMemoryDelta({
    bundle,
    topic: packet.activeEntities[0]?.name,
  });
  commitMemoryDelta(request.threadId, delta);

  logV6Trace(finalizeTrace(trace as TurnTrace));

  return {
    content: content.trim() || "I couldn’t complete this request.",
    runtime: renderer === "cloud" ? "cloud" : "apple-local",
    offline: renderer !== "cloud",
    condensationOccurred: false,
    aiChatId: request.aiChatId,
    citations: citationsFromEvidence(executed.evidence),
    v6Trace: trace as TurnTrace,
  };
}

/** Test/export helpers */
export { heuristicParse, surfacePrepass, computeParseCoverage, computeUserCoverage };
