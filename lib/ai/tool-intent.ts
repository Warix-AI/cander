/**
 * Decide whether the user turn is asking for an in-app action (tools)
 * vs general conversation / knowledge (answer immediately, no tools).
 */

const IN_APP_PATTERNS: RegExp[] = [
  /\b(create|make|new|start)\b[\s\S]{0,40}\bproject\b/i,
  /\bproject\b[\s\S]{0,40}\b(create|make|new)\b/i,
  /\b(open|go to|take me|navigate|switch to|show me)\b[\s\S]{0,48}\b(build|explore|work|settings|connectors|recents|chat|project)\b/i,
  /\b(build|explore|work|settings|connectors|recents)\b[\s\S]{0,24}\b(space|panel|screen|page)\b/i,
  /\b(search|find|list|show)\b[\s\S]{0,40}\b(my |the )?(projects?|workspace|recents)\b/i,
  /\b(delete|remove|archive)\b[\s\S]{0,40}\bproject\b/i,
  /\b(publish|deploy|preview)\b/i,
  /\b(connect|connector)\b[\s\S]{0,24}\b(gmail|slack|calendar|notion)\b/i,
  /\btake me there\b/i,
];

/** Obvious chitchat / general knowledge — never needs workspace tools. */
const CONVERSATION_ONLY_PATTERNS: RegExp[] = [
  /^(hi|hey|hello|yo|sup|howdy)\b/i,
  /\bhow('?s| is| are) (it|things|everything|you)\b/i,
  /\bhow (are|r) (you|u)\b/i,
  /\bwhat('?s| is) up\b/i,
  /\bgood (morning|afternoon|evening|night)\b/i,
  /\bthanks?\b|\bthank you\b/i,
  /\bhow (fast|tall|old|big|long|many|much|far)\b/i,
  /\bwhat (is|are|was|were|does|do|did|can)\b/i,
  /\bwho (is|are|was|were)\b/i,
  /\bwhy (is|are|do|does|did|can)\b/i,
  /\bexplain\b|\btell me about\b|\bdefine\b/i,
  /\bjoke\b|\bpoem\b|\bstory\b/i,
];

/**
 * True when the user is asking Cander to act inside the product
 * (navigate, create/open projects, search their workspace, etc.).
 */
export function isInAppToolIntent(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (CONVERSATION_ONLY_PATTERNS.some((re) => re.test(t))) {
    // Still allow tool intent if they also named an in-app action.
    if (!IN_APP_PATTERNS.some((re) => re.test(t))) return false;
  }
  return IN_APP_PATTERNS.some((re) => re.test(t));
}

/** True for greetings / trivia / Q&A that must not trigger tools. */
export function isConversationOnlyTurn(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (isInAppToolIntent(t)) return false;
  if (CONVERSATION_ONLY_PATTERNS.some((re) => re.test(t))) return true;
  // Short questions without workspace vocabulary → conversation
  if (
    t.length < 160 &&
    !/\b(project|workspace|build|explore|connector|settings|panel|preview)\b/i.test(
      t,
    )
  ) {
    return /[?]/.test(t) || /^(how|what|who|why|when|where|can|could|should|is|are|do|does)\b/i.test(t);
  }
  return false;
}
