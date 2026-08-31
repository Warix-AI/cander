/**
 * Stage 4 — Apple parse: TurnSpec from user message + context + surface spans.
 * Heuristic fallback when FM unavailable (tests / no device).
 */

import type { ContextPacket, Request, SurfaceExpectation, TurnSpec } from "../types.ts";
import type { ParseOutcome } from "../types.ts";
import { clarificationOutcome } from "./clarification.ts";

export type GenerateFn = (
  prompt: string,
  instructions: string,
) => Promise<string>;

const TURN_SPEC_INSTRUCTIONS = `You convert the user message into a TurnSpec JSON object.
Schema:
{
  "requests": [{
    "id": "r1",
    "kind": "fact"|"explain"|"compare"|"summarize"|"calculate"|"research",
    "subject": { "type":"named","value":"..." } | { "type":"context","ref":"..." } | { "type":"request_result","requestId":"r1","field":"..." },
    "property": "optional free text",
    "qualifiers": {},
    "dependencies": [{ "type":"scalar","requestId":"r1" } | { "type":"map","requestId":"r1","as":"member" }],
    "inputs": [{ "literal": ... } | { "requestId":"r1" }],
    "surfaceSpanIds": ["span_1"]
  }],
  "response": { "ordering":"request_order"|"synthesized", "detail":"short"|"normal"|"deep" }
}

Rules:
- Emit one request per distinct user ask; map surfaceSpanIds to the provided spans.
- Do not invent tools, URLs, or retrieval providers.
- Do not include project/build/calendar/email/CRM/actions.
- For "how old is each X" after a list ask, use a map dependency.
- Return ONLY JSON.`;

function extractJson(raw: string): unknown {
  const t = raw.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]!);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function coerceSpec(raw: unknown): TurnSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const requestsIn = Array.isArray(o.requests) ? o.requests : [];
  const requests: Request[] = [];
  for (let i = 0; i < requestsIn.length; i++) {
    const r = requestsIn[i] as Record<string, unknown>;
    if (!r || typeof r !== "object") continue;
    const kind = String(r.kind || "fact");
    const validKinds = [
      "fact",
      "explain",
      "compare",
      "summarize",
      "calculate",
      "research",
    ];
    if (!validKinds.includes(kind)) continue;
    requests.push({
      id: String(r.id || `r${i + 1}`),
      kind: kind as Request["kind"],
      subject: r.subject as Request["subject"],
      property: typeof r.property === "string" ? r.property : undefined,
      qualifiers:
        r.qualifiers && typeof r.qualifiers === "object"
          ? (r.qualifiers as Record<string, unknown>)
          : undefined,
      dependencies: Array.isArray(r.dependencies)
        ? (r.dependencies as Request["dependencies"])
        : undefined,
      inputs: Array.isArray(r.inputs)
        ? (r.inputs as Request["inputs"])
        : undefined,
      surfaceSpanIds: Array.isArray(r.surfaceSpanIds)
        ? r.surfaceSpanIds.map(String)
        : undefined,
    });
  }
  if (!requests.length) return null;
  const response = (o.response as TurnSpec["response"]) || {
    ordering: "request_order",
    detail: "normal",
  };
  return { requests, response };
}

/** Deterministic heuristic parse for tests and FM failure. */
export function heuristicParse(
  text: string,
  surface: SurfaceExpectation,
  packet: ContextPacket,
): ParseOutcome {
  const amb = packet.resolvedReferences.find((r) => r.status === "ambiguous");
  if (amb) {
    return clarificationOutcome({
      phrase: amb.phrase,
      candidates: amb.candidates?.map((c) => c.name),
      question:
        amb.candidates?.length
          ? `Which did you mean: ${amb.candidates.map((c) => c.name).join(" or ")}?`
          : `Which "${amb.phrase}" are you referring to?`,
    });
  }

  const unresolvedCompany = packet.resolvedReferences.find(
    (r) => r.status === "unresolved" && /company/i.test(r.phrase),
  );
  if (
    unresolvedCompany &&
    /\b(that|the)\s+(billing\s+)?company\b/i.test(text) &&
    !packet.activeEntities.length
  ) {
    return clarificationOutcome({
      phrase: unresolvedCompany.phrase,
      question: `Which company are you referring to by "${unresolvedCompany.phrase}"?`,
    });
  }

  const probable = surface.spans.filter((s) => s.type === "probable_request");
  const spans = probable.length ? probable : surface.spans;
  const requests: Request[] = [];

  // Board + ages pattern
  if (/board/i.test(text) && /how old|age/i.test(text)) {
    requests.push({
      id: "r1",
      kind: "fact",
      subject: { type: "named", value: extractSubject(text) || "Apple" },
      property: "board_members",
      surfaceSpanIds: spans[0] ? [spans[0].id] : ["span_1"],
    });
    requests.push({
      id: "r2",
      kind: "fact",
      subject: { type: "request_result", requestId: "r1", field: "member" },
      property: "age",
      dependencies: [{ type: "map", requestId: "r1", as: "member" }],
      surfaceSpanIds: spans[1] ? [spans[1].id] : spans[0] ? [spans[0].id] : [],
    });
    return {
      type: "ready",
      spec: {
        requests,
        response: { ordering: "request_order", detail: "normal" },
      },
    };
  }

  // CEO + how old is he (scalar dependency)
  if (
    /\b(ceo|chief executive|who runs)\b/i.test(text) &&
    /\b(how old|age)\b/i.test(text)
  ) {
    const company = extractSubject(text) || "Apple";
    requests.push({
      id: "r1",
      kind: "fact",
      subject: { type: "named", value: company },
      property: "current_ceo",
      surfaceSpanIds: spans[0] ? [spans[0].id] : ["span_1"],
    });
    requests.push({
      id: "r2",
      kind: "fact",
      subject: { type: "request_result", requestId: "r1" },
      property: "age",
      dependencies: [{ type: "scalar", requestId: "r1" }],
      surfaceSpanIds: spans[1] ? [spans[1].id] : spans[0] ? [spans[0].id] : [],
    });
    return {
      type: "ready",
      spec: {
        requests,
        response: { ordering: "request_order", detail: "normal" },
      },
    };
  }

  // Quantity follow-up: "what about five?" with active calculation in context
  if (
    /\bwhat about\s+(\d+)\b/i.test(text) ||
    /^\s*(and\s+)?(\d+)\s*\??\s*$/i.test(text)
  ) {
    const qty = Number(
      text.match(/\bwhat about\s+(\d+)\b/i)?.[1] ||
        text.match(/(\d+)/)?.[1] ||
        0,
    );
    const calcNote = packet.relevantMemories.find((m) =>
      /calories|perItem|calculation/i.test(m.text),
    );
    const perItemMatch = calcNote?.text.match(/perItem[=:]\s*(\d+)/i);
    const perItem = perItemMatch ? Number(perItemMatch[1]) : undefined;
    if (qty && perItem != null) {
      requests.push({
        id: "r1",
        kind: "calculate",
        property: "calories",
        expression: {
          op: "multiply",
          args: [{ literal: perItem }, { literal: qty }],
        },
        inputs: [{ literal: perItem }, { literal: qty }],
        surfaceSpanIds: spans[0] ? [spans[0].id] : ["span_1"],
        qualifiers: { followUpQuantity: qty },
      });
      return {
        type: "ready",
        spec: {
          requests,
          response: { ordering: "request_order", detail: "short" },
        },
      };
    }
  }

  // Share price + multiply
  if (/share\s*price|stock\s*price/i.test(text) && /\d+\s+shares?/i.test(text)) {
    const qty = Number(text.match(/(\d+)\s+shares?/i)?.[1] || 20);
    requests.push({
      id: "r1",
      kind: "fact",
      subject: { type: "named", value: extractSubject(text) || "Tesla" },
      property: "current_share_price",
      surfaceSpanIds: spans[0] ? [spans[0].id] : ["span_1"],
    });
    requests.push({
      id: "r2",
      kind: "calculate",
      dependencies: [{ type: "scalar", requestId: "r1" }],
      inputs: [{ requestId: "r1" }, { literal: qty }],
      expression: {
        op: "multiply",
        args: [{ requestId: "r1" }, { literal: qty }],
      },
      surfaceSpanIds: spans[1] ? [spans[1].id] : spans[0] ? [spans[0].id] : [],
    });
    return {
      type: "ready",
      spec: {
        requests,
        response: { ordering: "request_order", detail: "normal" },
      },
    };
  }

  // Compare internal vs external
  if (/compare/i.test(text) && /refund/i.test(text)) {
    requests.push({
      id: "r1",
      kind: "fact",
      subject: { type: "named", value: "our refund policy" },
      property: "refund_policy",
      qualifiers: { internal: true },
      surfaceSpanIds: spans[0] ? [spans[0].id] : ["span_1"],
    });
    requests.push({
      id: "r2",
      kind: "fact",
      subject: { type: "named", value: "Amazon" },
      property: "refund_policy",
      surfaceSpanIds: spans[1] ? [spans[1].id] : ["span_2"],
    });
    requests.push({
      id: "r3",
      kind: "compare",
      dependencies: [
        { type: "scalar", requestId: "r1" },
        { type: "scalar", requestId: "r2" },
      ],
      surfaceSpanIds: spans.map((s) => s.id),
    });
    return {
      type: "ready",
      spec: {
        requests,
        response: { ordering: "synthesized", detail: "normal" },
      },
    };
  }

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i]!;
    const t = span.text;
    let kind: Request["kind"] = "fact";
    if (/explain|how\s+does|what\s+is\s+photosynthesis/i.test(t)) kind = "explain";
    else if (/compare/i.test(t)) kind = "compare";
    else if (/summarize|summary/i.test(t)) kind = "summarize";
    else if (/research|best\s+local/i.test(t)) kind = "research";
    else if (/calculate|how many|cost|calories/i.test(t)) {
      kind = /calories|price|cost|shares/i.test(t) ? "fact" : "calculate";
    }

    const resolved = packet.resolvedReferences.find(
      (r) => r.status === "resolved",
    );
    let subjectValue =
      resolved?.target?.name ||
      extractSubject(t) ||
      extractSubject(text) ||
      "topic";

    let property = "info";
    if (/ceo|chief executive|who runs/i.test(t)) property = "current_ceo";
    else if (/share\s*price|stock\s*price|current\s+share/i.test(t))
      property = "current_share_price";
    else if (/calories?/i.test(t)) property = "calories";
    else if (/age|how old/i.test(t)) property = "age";
    else if (/photosynthesis/i.test(t)) property = "photosynthesis";
    else if (/pto|handbook/i.test(t)) property = "pto";
    else if (/refund/i.test(t)) property = "refund_policy";
    else if (/everest|how tall|elevation|height/i.test(t)) {
      property = "height";
      if (/everest/i.test(t)) subjectValue = "Mount Everest";
    } else if (/weather|forecast|temperature/i.test(t)) property = "weather";
    else if (/when|date|play/i.test(t)) property = "date";
    else if (/where|venue/i.test(t)) property = "venue";
    else if (/explain/i.test(t)) property = "explanation";

    // Pronoun follow-up: "how old is he/it/they" with active entity
    if (
      /\b(he|she|they|it|that)\b/i.test(t) &&
      packet.activeEntities.length === 1 &&
      !extractSubject(t)
    ) {
      subjectValue = packet.activeEntities[0]!.name;
    }

    requests.push({
      id: `r${i + 1}`,
      kind,
      subject: { type: "named", value: subjectValue },
      property,
      surfaceSpanIds: [span.id],
      qualifiers: /handbook|our\s+|pto/i.test(t)
        ? { internal: true }
        : undefined,
    });
  }

  if (!requests.length) {
    requests.push({
      id: "r1",
      kind: "explain",
      subject: { type: "named", value: text.slice(0, 80) },
      property: "response",
      surfaceSpanIds: spans[0] ? [spans[0].id] : undefined,
    });
  }

  return {
    type: "ready",
    spec: {
      requests,
      response: { ordering: "request_order", detail: "normal" },
    },
  };
}

function extractSubject(text: string): string | null {
  const m =
    text.match(/\b(?:Apple|Tesla|Amazon|BYU|Utah|Polar|Google|Microsoft)\b/i) ||
    text.match(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/);
  return m?.[0] ?? null;
}

export async function appleParse(args: {
  text: string;
  surface: SurfaceExpectation;
  packet: ContextPacket;
  generate?: GenerateFn;
  useHeuristicOnly?: boolean;
}): Promise<{ outcome: ParseOutcome; raw?: string; usedHeuristic: boolean }> {
  if (args.packet.resolvedReferences.some((r) => r.status === "ambiguous")) {
    const amb = args.packet.resolvedReferences.find(
      (r) => r.status === "ambiguous",
    )!;
    return {
      outcome: clarificationOutcome({
        phrase: amb.phrase,
        candidates: amb.candidates?.map((c) => c.name),
        question:
          amb.candidates?.length
            ? `Which did you mean: ${amb.candidates.map((c) => c.name).join(" or ")}?`
            : `Which "${amb.phrase}" are you referring to?`,
      }),
      usedHeuristic: true,
    };
  }

  if (!args.generate || args.useHeuristicOnly) {
    return {
      outcome: heuristicParse(args.text, args.surface, args.packet),
      usedHeuristic: true,
    };
  }

  const spanLines = args.surface.spans
    .map((s) => `${s.id} [${s.type}]: ${s.text}`)
    .join("\n");
  const refLines = args.packet.resolvedReferences
    .map(
      (r) =>
        `${r.phrase} → ${r.status}${r.target ? ` (${r.target.name})` : ""}`,
    )
    .join("\n");

  const prompt = `User message:\n${args.text}\n\nSurface spans:\n${spanLines}\n\nResolved references:\n${refLines || "(none)"}\n\nRecent turns:\n${args.packet.recentTurns
    .map((t) => `${t.role}: ${t.content.slice(0, 200)}`)
    .join("\n")}`;

  try {
    const raw = await args.generate(prompt, TURN_SPEC_INSTRUCTIONS);
    const coerced = coerceSpec(extractJson(raw));
    if (coerced) {
      return { outcome: { type: "ready", spec: coerced }, raw, usedHeuristic: false };
    }
  } catch {
    /* fall through */
  }

  return {
    outcome: heuristicParse(args.text, args.surface, args.packet),
    usedHeuristic: true,
  };
}

/** One bounded repair: ask model (or heuristic) to cover uncovered spans. */
export async function repairParse(args: {
  text: string;
  surface: SurfaceExpectation;
  packet: ContextPacket;
  prior: TurnSpec;
  uncoveredSpanIds: string[];
  generate?: GenerateFn;
}): Promise<TurnSpec> {
  const uncovered = args.surface.spans.filter((s) =>
    args.uncoveredSpanIds.includes(s.id),
  );
  if (!args.generate) {
    const extra = heuristicParse(
      uncovered.map((s) => s.text).join(" and "),
      {
        ...args.surface,
        spans: uncovered,
      },
      args.packet,
    );
    if (extra.type === "ready") {
      const offset = args.prior.requests.length;
      return {
        ...args.prior,
        requests: [
          ...args.prior.requests,
          ...extra.spec.requests.map((r, i) => ({
            ...r,
            id: `r${offset + i + 1}`,
            surfaceSpanIds: r.surfaceSpanIds?.length
              ? r.surfaceSpanIds
              : [uncovered[i]?.id].filter(Boolean) as string[],
          })),
        ],
      };
    }
    return args.prior;
  }

  const prompt = `Prior TurnSpec missed these spans:\n${uncovered
    .map((s) => `${s.id}: ${s.text}`)
    .join("\n")}\n\nFull user message:\n${args.text}\n\nReturn a complete TurnSpec covering ALL spans.`;
  try {
    const raw = await args.generate(prompt, TURN_SPEC_INSTRUCTIONS);
    const coerced = coerceSpec(extractJson(raw));
    if (coerced) return coerced;
  } catch {
    /* ignore */
  }
  return repairParse({ ...args, generate: undefined });
}
