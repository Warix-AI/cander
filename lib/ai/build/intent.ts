/**
 * Intent router for messages sent inside a Build (site/app) project.
 *
 * Every message used to be forced through the edit pipeline with a
 * "use computer.files.write" retry, so questions like "what pages do I have?"
 * produced file writes. Classify first; only `change_request` may write.
 *
 * Pure + dependency-free so it can run in the browser, on the server, and in
 * node tests.
 */

import { isBuildCreateIntent } from "./capabilities.ts";

export type BuildMessageIntent =
  | "setup"
  | "create"
  | "change_request"
  | "publish_command"
  | "chat_question";

const PUBLISH_RE =
  /^\s*(re-?publish|publish|go\s+live|make\s+it\s+live|push\s+(it\s+)?live|deploy(\s+it)?(\s+to\s+production)?|ship\s+it)\b[\s!.]*$/i;

const PUBLISH_PHRASE_RE =
  /\b(re-?publish|publish|go\s+live|make\s+(it|this|the\s+site)\s+live|deploy\s+(it|this|the\s+site)\s+to\s+production)\b/i;

const SETUP_RE =
  /website\.build_from_setup|Guided website setup brief|confirm_build/i;

const CREATE_RE =
  /\b(build\s+my\s+site|ready\s+to\s+build|start\s+(the\s+)?build|generate\s+(the\s+)?(site|website)|build\s+it|create\s+it|implement(\s+it)?|let'?s\s+build|go\s+ahead\s+and\s+build)\b/i;

/** Imperative change verbs, including natural phrasings without an object. */
const CHANGE_VERB_RE =
  /\b(add|remove|delete|replace|swap|update|change|edit|fix|repair|make|use|set|move|rename|resize|reorder|shrink|enlarge|tweak|adjust|switch|turn|convert|restyle|redo|rewrite|reword|shorten|lengthen|increase|decrease|hide|show|center|align|put|insert|drop|bump|lower|raise|darken|lighten|brighten|tighten|loosen|animate|link|embed|upload|install|enable|disable|configure|translate|migrate|refactor|clean\s*up|improve|polish|optimi[sz]e|speed\s+up)\b/i;

/** Nouns that indicate the user is talking about the site itself. */
const SITE_NOUN_RE =
  /\b(header|footer|nav(bar|igation)?|menu|hero|section|page|pages|button|cta|link|logo|photo|image|picture|banner|background|color|colou?r|font|typography|text|copy|heading|headline|title|tagline|paragraph|pricing|testimonial|faq|contact\s+form|form|gallery|carousel|slider|card|grid|layout|spacing|padding|margin|border|shadow|animation|dark\s+mode|theme|sticky|floating|mobile|responsive|seo|metadata|sitemap|robots|favicon|og\s+image|about|services|blog|footer|route|url|domain|site|website)\b/i;

/** Clear question shape: interrogative opener or trailing question mark. */
const QUESTION_RE =
  /^(what|which|why|how|when|where|who|is|are|does|do|did|can|could|would|should|will|tell\s+me|explain|describe|show\s+me|walk\s+me|summari[sz]e|list)\b|\?\s*$/i;

/** Question forms that are actually change requests ("can you make X darker?"). */
const REQUEST_QUESTION_RE =
  /^(can|could|would|will)\s+(you|u|we)\s+(please\s+)?(add|remove|delete|replace|swap|update|change|edit|fix|make|use|set|move|rename|hide|show|put|switch|turn)\b/i;

const GREETING_RE =
  /^(hi|hello|hey|yo|thanks|thank\s+you|ty|ok(ay)?|cool|nice|great|awesome|love\s+it|looks\s+good|perfect|good\s+(morning|afternoon|evening))[\s!.]*$/i;

export function classifyBuildMessageIntent(input: string): BuildMessageIntent {
  const text = (input || "").trim();
  if (!text) return "chat_question";

  if (SETUP_RE.test(text)) return "setup";
  if (PUBLISH_RE.test(text)) return "publish_command";
  if (isBuildCreateIntent(text) || CREATE_RE.test(text)) return "create";
  if (GREETING_RE.test(text)) return "chat_question";

  // "Can you make the header sticky?" is a request, not a question.
  if (REQUEST_QUESTION_RE.test(text)) return "change_request";

  // Publish mentioned as part of a longer instruction ("fix the hero then publish").
  if (PUBLISH_PHRASE_RE.test(text) && !CHANGE_VERB_RE.test(text)) {
    return "publish_command";
  }

  if (QUESTION_RE.test(text)) return "chat_question";

  if (CHANGE_VERB_RE.test(text) && SITE_NOUN_RE.test(text)) {
    return "change_request";
  }
  // Desire statements about a site element: "I want a floating header",
  // "I'd like the hero to be darker", "the footer should be smaller".
  if (
    /\b(i\s+want|i'?d\s+like|i\s+need|we\s+want|we\s+need|should\s+be|needs?\s+to\s+be|let'?s\s+(have|do|try|go\s+with)|please)\b/i.test(
      text,
    ) &&
    SITE_NOUN_RE.test(text)
  ) {
    return "change_request";
  }
  // Short imperative fragments without a recognised noun ("make it pop",
  // "darker", "more whitespace") are still change requests in a Build project.
  if (CHANGE_VERB_RE.test(text) && text.split(/\s+/).length <= 12) {
    return "change_request";
  }
  // Bare adjective/noun feedback on the design.
  if (
    /^(more|less|bigger|smaller|darker|lighter|bolder|cleaner|simpler|wider|narrower|tighter|looser)\b/i.test(
      text,
    )
  ) {
    return "change_request";
  }

  return "chat_question";
}

/** Model pasted a file/HTML document into chat instead of using tools. */
export function looksLikeCodeDump(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (/<!DOCTYPE\s+html/i.test(t)) return true;
  if (/<html[\s>]/i.test(t) && /<style[\s>]/i.test(t)) return true;
  if (/```(?:html|javascript|tsx|jsx|css|typescript)/i.test(t) && t.length > 280) {
    return true;
  }
  if (
    /\b(?:app\/page\.(?:js|tsx)|package\.json)\b/i.test(t) &&
    /export\s+default\s+function/i.test(t)
  ) {
    return true;
  }
  if (
    /export\s+default\s+function\s+\w+/i.test(t) &&
    /return\s*\(\s*</.test(t) &&
    t.length > 400
  ) {
    return true;
  }
  return false;
}

/** Whether a classified intent is allowed to write files. */
export function intentMayWriteFiles(intent: BuildMessageIntent): boolean {
  return intent === "change_request" || intent === "create";
}
