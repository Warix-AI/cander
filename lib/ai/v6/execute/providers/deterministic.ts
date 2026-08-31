import type { Evidence, NormalizedRequest, RequestResult } from "../../types.ts";

export async function executeDeterministic(
  n: NormalizedRequest,
  resultMap: Map<string, RequestResult>,
): Promise<{ result: RequestResult; evidence: Evidence[] }> {
  const expr = n.request.expression;
  if (!expr) {
    // Literal arithmetic from inputs
    const nums = (n.request.inputs || [])
      .map((inp) => {
        if ("literal" in inp) return Number(inp.literal);
        if ("requestId" in inp) {
          const up = resultMap.get(inp.requestId);
          return Number(up?.value);
        }
        return NaN;
      })
      .filter((x) => !Number.isNaN(x));
    if (nums.length >= 2) {
      const value = nums.reduce((a, b) => a * b, 1);
      return {
        result: {
          requestId: n.request.id,
          status: "verified",
          value,
          evidenceIds: [],
          reason: "deterministic_product",
        },
        evidence: [],
      };
    }
    return {
      result: {
        requestId: n.request.id,
        status: "unresolved",
        evidenceIds: [],
        reason: "no_expression",
      },
      evidence: [],
    };
  }

  const { evaluateExpression } = await import("../../derive/expressions.ts");
  try {
    const value = evaluateExpression(expr, resultMap);
    return {
      result: {
        requestId: n.request.id,
        status: "verified",
        value,
        evidenceIds: [],
        reason: "expression_eval",
      },
      evidence: [],
    };
  } catch (e) {
    return {
      result: {
        requestId: n.request.id,
        status: "blocked_upstream",
        evidenceIds: [],
        reason: e instanceof Error ? e.message : "derive_failed",
      },
      evidence: [],
    };
  }
}

/** Evaluate pure math string like "17*3" */
export function evalArithmeticText(text: string): number | null {
  const m = text.match(/(\d+)\s*([\+\-\*\/x×÷])\s*(\d+)/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[3]);
  const op = m[2]!;
  if (op === "+" ) return a + b;
  if (op === "-") return a - b;
  if (op === "*" || op === "x" || op === "×") return a * b;
  if (op === "/" || op === "÷") return b === 0 ? null : a / b;
  return null;
}
