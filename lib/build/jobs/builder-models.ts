/**
 * Configurable model routing for the V2 builder.
 * Only uses model IDs from env / existing resolvers — never invents IDs.
 */

export type BuilderModelRole =
  | "planner"
  | "fast"
  | "coder"
  | "strongCoder"
  | "visualReview";

export type BuilderModelBundle = {
  planner: string;
  fast: string;
  coder: string;
  strongCoder: string;
  visualReview: string;
};

export type EditComplexity = "trivial" | "standard" | "complex";

function envModel(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function defaultChatModel(): string {
  return (
    process.env.OPENAI_MODEL?.trim() ||
    process.env.RAW_OPENAI_MODEL?.trim() ||
    "gpt-5.6-luna"
  );
}

function defaultCodingModel(): string {
  return (
    process.env.CODING_AGENT_MODEL?.trim() ||
    process.env.OPENAI_CODING_MODEL?.trim() ||
    "gpt-5.3-codex"
  );
}

/** Resolve the five builder roles from env, falling back to known chat/coding models. */
export function resolveBuilderModels(): BuilderModelBundle {
  const chat = defaultChatModel();
  const coding = defaultCodingModel();
  return {
    planner: envModel("CANDER_BUILDER_PLANNER_MODEL", chat),
    fast: envModel("CANDER_BUILDER_FAST_MODEL", chat),
    coder: envModel("CANDER_BUILDER_CODER_MODEL", coding),
    strongCoder: envModel("CANDER_BUILDER_STRONG_CODER_MODEL", coding),
    visualReview: envModel("CANDER_BUILDER_VISUAL_MODEL", chat),
  };
}

/**
 * Heuristic edit complexity from the user instruction (no LLM).
 * Used to pick cheap vs standard vs strong without a classification call.
 */
export function classifyEditComplexity(instruction: string | null | undefined): EditComplexity {
  const t = String(instruction || "").toLowerCase();
  if (!t.trim()) return "standard";

  const complex =
    /\b(auth|login|signup|supabase|database|migration|rls|permission|oauth|stripe|webhook|multi-tenant|role-based|api route|server action)\b/.test(
      t,
    ) ||
    /\b(add (a )?(dashboard|admin|billing|checkout|user profile|profiles))\b/.test(t) ||
    /\b(rebuild|from scratch|entire (app|site)|redesign (the )?(whole|entire))\b/.test(t);
  if (complex) return "complex";

  const trivial =
    /\b(typo|headline|title|subtitle|tagline|button (color|label|text)|make .{0,40} blue|make .{0,40} darker|font size|spacing|padding|margin|copy|wording|rename|swap (the )?image|logo)\b/.test(
      t,
    ) &&
    !/\b(and also|then |plus |as well as|redesign|new page|new section|add (a )?page)\b/.test(t) &&
    t.length < 280;
  if (trivial) return "trivial";

  return "standard";
}

export function pickCoderModel(opts: {
  models: BuilderModelBundle;
  mode: "create" | "edit";
  projectKind: "site" | "app";
  editComplexity?: EditComplexity;
  escalate?: boolean;
  routingEnabled: boolean;
}): string {
  if (!opts.routingEnabled) return opts.models.coder;
  if (opts.escalate) return opts.models.strongCoder;
  if (opts.mode === "create" && opts.projectKind === "app") return opts.models.strongCoder;
  if (opts.mode === "edit") {
    if (opts.editComplexity === "trivial") return opts.models.fast;
    if (opts.editComplexity === "complex") return opts.models.strongCoder;
  }
  return opts.models.coder;
}

export function pickPlannerModel(opts: {
  models: BuilderModelBundle;
  routingEnabled: boolean;
}): string {
  if (!opts.routingEnabled) return opts.models.planner;
  return opts.models.planner;
}

export function pickVisualReviewModel(opts: {
  models: BuilderModelBundle;
  routingEnabled: boolean;
}): string {
  return opts.routingEnabled ? opts.models.visualReview : opts.models.planner;
}

/** True when an edit is likely visual enough to warrant visual QA. */
export function editNeedsVisualQa(instruction: string | null | undefined): boolean {
  const t = String(instruction || "").toLowerCase();
  if (!t.trim()) return false;
  if (classifyEditComplexity(t) === "trivial" && !/\b(layout|hero|section|redesign|style|color|theme|mobile)\b/.test(t)) {
    return false;
  }
  return /\b(design|layout|hero|style|theme|color|spacing|mobile|responsive|look|visual|redesign|section|header|footer|nav)\b/.test(
    t,
  );
}
