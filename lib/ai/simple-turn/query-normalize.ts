/**
 * Canonical lookup query normalization — describe the fact needed, not user wording.
 */

const NARRATIVE_PREFIX =
  /^(if i|when i|i eat|i have|i want|i need|can you|please|tell me|how many|how much|what(?:'s| is)|find|get|look up)\b[\s,]*/i;

const FILLER_CHUNKS =
  /\b(if i eat|i have a|i have|and then|please|can you|tell me|from the|for me)\b/gi;

const TRAILING_CLAUSE =
  /\b(how many|how much|is that|are there|total|altogether)\b.*$/i;

/**
 * Build a clean standalone search query from normalized intent fields.
 * Bad:  "Taco Bell If I eat three regular tacos"
 * Good: "Taco Bell regular taco calories"
 */
export function buildCanonicalLookupQuery(opts: {
  entity?: string;
  subject?: string;
  goal?: string;
  action?: string;
  quantity?: number;
  rawQ?: string;
}): string {
  const entity = (opts.entity ?? "").trim();
  const subject = (opts.subject ?? "").trim();

  if (entity && subject) {
    return sanitizeQuery(`${entity} ${subject}`.replace(/\s+/g, " ").trim());
  }

  if (opts.rawQ?.trim()) {
    return sanitizeQuery(
      canonicalizeRawQuery(opts.rawQ, { entity, subject, goal: opts.goal }),
    );
  }

  if (entity && opts.goal) {
    const fact = factPhraseFromGoal(opts.goal, entity);
    return sanitizeQuery(`${entity} ${fact}`.trim());
  }

  if (opts.goal) {
    return sanitizeQuery(factPhraseFromGoal(opts.goal, entity));
  }

  return sanitizeQuery([entity, subject].filter(Boolean).join(" "));
}

function factPhraseFromGoal(goal: string, entity?: string): string {
  let g = goal.trim();
  if (entity) {
    g = g.replace(new RegExp(escapeRegExp(entity), "ig"), " ").trim();
  }
  g = g
    .replace(/\bfind\b/gi, "")
    .replace(/\bin one\b/gi, "")
    .replace(/\bcalories in\b/gi, "calories")
    .replace(/\s+/g, " ")
    .trim();
  return g;
}

function canonicalizeRawQuery(
  raw: string,
  ctx: { entity?: string; subject?: string; goal?: string },
): string {
  let q = raw.trim();

  // If raw already looks like entity + short subject, keep structure
  if (ctx.entity && ctx.subject) {
    return `${ctx.entity} ${ctx.subject}`.replace(/\s+/g, " ").trim();
  }

  q = q.replace(NARRATIVE_PREFIX, "");
  q = q.replace(FILLER_CHUNKS, " ");
  q = q.replace(TRAILING_CLAUSE, "");
  q = q.replace(/\b(three|four|five|six|seven|eight|nine|ten|\d+)\b/gi, " ");

  if (ctx.entity && !q.toLowerCase().includes(ctx.entity.toLowerCase())) {
    q = `${ctx.entity} ${q}`;
  }

  // Prefer goal-derived fact words (calories, price, schedule…)
  if (ctx.goal && /\bcalories?\b/i.test(ctx.goal) && !/\bcalories?\b/i.test(q)) {
    q = `${q} calories`;
  }

  return q.replace(/\s+/g, " ").trim();
}

function sanitizeQuery(q: string): string {
  return q
    .replace(/[?!]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when a query still looks like pasted user narrative. */
export function looksLikeNarrativeQuery(q: string): boolean {
  const t = q.trim();
  if (!t) return true;
  if (/^(if i|i eat|i have|can you|tell me|when i)\b/i.test(t)) return true;
  if (/\bif i (eat|have|drink|order)\b/i.test(t)) return true;
  if (/\bi have (a|an)\b/i.test(t)) return true;
  if (t.split(/\s+/).length > 12 && /\b(i|me|my|we)\b/i.test(t)) return true;
  if (/\bhow many\b.*\bis that\b/i.test(t)) return true;
  return false;
}

/**
 * Heuristic: multi-brand calorie / nutrition compound questions.
 * Prefer a single coherent Exa Deep query (Exa handles per-item + total).
 * Per-item split is reserved for refine-after-verify-failure.
 */
export function isCoherentNutritionAsk(userText: string): boolean {
  if (!/\bcalories?\b/i.test(userText)) return false;
  const brands = countNutritionBrands(userText);
  const items = heuristicCalorieIntents(userText);
  return brands >= 2 || (items != null && items.length >= 2);
}

/** One Exa Deep query for a multi-item calorie ask — do not pre-split. */
export function buildCoherentCalorieQuery(userText: string): string | null {
  if (!isCoherentNutritionAsk(userText)) return null;
  const cleaned = userText
    .replace(/[?]+$/g, "")
    .replace(/^(if i eat|how many calories (are|is) in)\s+/i, "")
    .trim();
  // Prefer a playground-style complete ask
  if (/how many/i.test(userText) && /calories?/i.test(userText)) {
    const body = userText
      .replace(/[?]+$/g, "")
      .replace(/^(can you tell me |please )/i, "")
      .trim();
    return `${body}? Give the per-item calorie values and total.`.slice(0, 400);
  }
  return `How many total calories are in ${cleaned}? Give the per-item calorie values and total.`.slice(
    0,
    400,
  );
}

function countNutritionBrands(text: string): number {
  const brands = [
    /taco bell/i,
    /mcdonald'?s/i,
    /chick-?fil-?a/i,
    /burger king/i,
    /wendy'?s/i,
    /starbucks/i,
    /chipotle/i,
    /subway/i,
  ];
  return brands.filter((re) => re.test(text)).length;
}

/**
 * Per-item calorie intents — used when a single Deep query fails verification
 * and we need a bounded split retry.
 */
export function heuristicCalorieIntents(userText: string): Array<{
  entity: string;
  subject: string;
  quantity: number;
  goal: string;
  q: string;
}> | null {
  if (!/\bcalories?\b/i.test(userText)) return null;

  const found: Array<{
    entity: string;
    subject: string;
    quantity: number;
    goal: string;
    q: string;
  }> = [];

  // "three regular tacos from Taco Bell" / "a medium Sprite from McDonald's"
  const itemFromBrand =
    /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+((?:regular|medium|large|small)\s+)?([A-Za-z][\w'-]*)\s+from\s+([A-Z][\w'’&]*(?:\s+[A-Z][\w'’&]*)*)/g;

  for (const m of userText.matchAll(itemFromBrand)) {
    const quantity = parseQuantity(m[1]!);
    const size = (m[2] ?? "").trim();
    const itemRaw = m[3]!.trim();
    const brand = m[4]!.trim().replace(/Mcdonald'?s/i, "McDonald's");
    const item = singularizeFood(`${size} ${itemRaw}`.trim().toLowerCase());
    const subject = `${item} calories`;
    found.push({
      entity: brand,
      subject,
      quantity,
      goal: `find calories in one ${brand} ${item}`,
      q: buildCanonicalLookupQuery({
        entity: brand,
        subject,
      }),
    });
  }

  // "10 Taco Bell Spicy Potato Soft Tacos" / "one medium McDonald's Sprite"
  if (found.length < 2) {
    const brandFirst =
      /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+((?:regular|medium|large|small)\s+)?(Taco Bell|McDonald'?s|Chick-?fil-?A|Burger King|Wendy'?s|Starbucks|Chipotle)\s+([A-Za-z][\w' -]{1,60}?)(?=,|\band\b|$|\?)/gi;
    for (const m of userText.matchAll(brandFirst)) {
      const quantity = parseQuantity(m[1]!);
      const size = (m[2] ?? "").trim();
      const brand = m[3]!.trim().replace(/Mcdonald'?s/i, "McDonald's");
      const item = singularizeFood(
        `${size} ${m[4]!}`.trim().toLowerCase(),
      );
      if (found.some((f) => f.entity.toLowerCase() === brand.toLowerCase())) {
        continue;
      }
      found.push({
        entity: brand,
        subject: `${item} calories`,
        quantity,
        goal: `find calories in one ${brand} ${item}`,
        q: buildCanonicalLookupQuery({ entity: brand, subject: `${item} calories` }),
      });
    }
  }

  if (found.length >= 1) return found;
  return null;
}

function singularizeFood(item: string): string {
  return item
    .replace(/\btacos\b/i, "taco")
    .replace(/\bburgers\b/i, "burger")
    .replace(/\bfries\b/i, "fries")
    .replace(/\s+/g, " ")
    .trim();
}

function parseQuantity(raw: string): number {
  const map: Record<string, number> = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const t = raw.toLowerCase().trim();
  if (map[t] != null) return map[t]!;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
