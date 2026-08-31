/**
 * Stage 11 — Derived computation (code only, never Apple).
 */

import type { Expression, ExpressionInput, RequestResult } from "../types.ts";

function resolveInput(
  input: ExpressionInput,
  results: Map<string, RequestResult>,
): number {
  if ("op" in input) {
    return evaluateExpression(input, results);
  }
  if ("literal" in input) {
    const n = Number(input.literal);
    if (Number.isNaN(n)) throw new Error("bad_literal");
    return n;
  }
  const up = results.get(input.requestId);
  if (!up || up.status === "unresolved" || up.status === "blocked_upstream") {
    throw new Error("upstream_unresolved");
  }
  const n = Number(up.value);
  if (Number.isNaN(n)) throw new Error("upstream_not_numeric");
  return n;
}

export function evaluateExpression(
  expr: Expression,
  results: Map<string, RequestResult>,
): number {
  const args = expr.args.map((a) => resolveInput(a, results));
  switch (expr.op) {
    case "add":
      return args.reduce((a, b) => a + b, 0);
    case "subtract":
      return args.length >= 2 ? args[0]! - args[1]! : -args[0]!;
    case "multiply":
      return args.reduce((a, b) => a * b, 1);
    case "divide":
      if (!args[1]) throw new Error("divide_by_zero");
      return args[0]! / args[1]!;
    case "sum":
      return args.reduce((a, b) => a + b, 0);
    case "average":
      return args.length ? args.reduce((a, b) => a + b, 0) / args.length : 0;
    case "compare":
      return args[0]! - (args[1] ?? 0);
    default:
      throw new Error("unknown_op");
  }
}
