/**
 * Calendar routing — detect Google Calendar turns including short follow-ups
 * ("wrong day", "check that") when the thread already discussed calendar.
 */

import { isCalendarConnectorIntent } from "../tools/domains.ts";

type ThreadMessage = {
  role: string;
  content: string;
};

export function threadHasCalendarContext(messages?: ThreadMessage[]): boolean {
  const recent = [...(messages ?? [])].slice(-14);
  return recent.some((message) =>
    /\b(google\s+calendar|gcal|calendar|calendars|agenda|schedule|all-?day|event)\b/i.test(
      message.content || "",
    ),
  );
}

/** Follow-ups that only make sense after a calendar claim/action. */
export function looksLikeCalendarFollowUp(content: string): boolean {
  const text = (content || "").trim();
  if (!text) return false;
  return (
    /\b(wrong (day|date|time)|correct (day|date|time)|other day|next day|previous day)\b/i.test(
      text,
    ) ||
    /\b(check|verify|confirm|look( again)?|double-?check)\b[\s\S]{0,48}\b(added|created|put|scheduled|event|day|date)\b/i.test(
      text,
    ) ||
    /\b(move|reschedule|fix|update|delete|remove)\b[\s\S]{0,40}\b(event|it|that)\b/i.test(
      text,
    ) ||
    /\b(september|october|november|december|january|february|march|april|may|june|july|august)\b[\s\S]{0,24}\b\d{1,2}(st|nd|rd|th)?\b/i.test(
      text,
    )
  );
}

/** True when this turn should run with Calendar connector tools. */
export function isCalendarConnectorTurn(
  content: string,
  messages?: ThreadMessage[],
): boolean {
  const text = (content || "").trim();
  if (!text) return false;
  if (isCalendarConnectorIntent(text)) return true;
  if (threadHasCalendarContext(messages) && looksLikeCalendarFollowUp(text)) {
    return true;
  }
  if (
    threadHasCalendarContext(messages) &&
    /\b(check|verify|confirm|look|see|show|list|find|when|what day)\b/i.test(text)
  ) {
    return true;
  }
  return false;
}
