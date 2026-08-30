/**
 * Detect when the user is referring to the active right-panel page / screen.
 */

/** User is asking about the visible right-panel browser / preview. */
export function refersToActiveBrowserSurface(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  return (
    /\b(this|the|that)\s+(page|website|site|preview|screen|tab|window|viewport|ui|layout|button|headline|header|cta)\b/i.test(
      t,
    ) ||
    /\b(on|to)\s+the\s+right\b/i.test(t) ||
    /\bwhat\s+(i'?m|i\s+am)\s+looking\s+at\b/i.test(t) ||
    /\b(my|the)\s+screen\b/i.test(t) ||
    /\bcan\s+you\s+see\b[\s\S]{0,40}\b(screen|page|right|preview|this|what)\b/i.test(
      t,
    ) ||
    /\b(see|look\s+at|describe|summarize|read)\b[\s\S]{0,48}\b(the\s+)?(page|website|preview|screen|right\s+panel)\b/i.test(
      t,
    ) ||
    /\b(selected|highlighted)\s+text\b/i.test(t) ||
    /\bwhat\s+does\s+(this|the)\s+(button|link|text|selection)\b/i.test(t) ||
    /\bwhy\s+does\s+(this|the)\s+(button|layout|page|ui)\b/i.test(t)
  );
}

/** Visual / layout questions prefer a viewport screenshot. */
export function prefersViewportCapture(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  return (
    /\b(look|looks|looking|appearance|layout|spacing|aligned|alignment|color|colours?|colors?|image|images|animation|animated|canvas|screenshot|visual|visually|pixel|css|style|styled|design|ui|button\s+look)\b/i.test(
      t,
    ) ||
    /\bwhy\s+does\s+(this|the)\s+(button|layout|page)\b/i.test(t) ||
    /\b(too\s+(big|small|wide|narrow)|overflow|cut\s+off|cropped)\b/i.test(t)
  );
}

/** User is asking specifically about selected text. */
export function refersToPageSelection(content: string): boolean {
  return /\b(selected|highlighted|selection)\b[\s\S]{0,24}\b(text|content)?\b/i.test(
    content,
  );
}

/** Metadata-only (title/url) without full page text. */
export function prefersBrowserMetadataOnly(content: string): boolean {
  const t = content.trim();
  return (
    /\b(what\s+(tab|url|site|page)\s+(is|am)\b|which\s+(tab|url)|what'?s\s+the\s+url)\b/i.test(
      t,
    ) && !prefersViewportCapture(t) && !/\b(about|content|say|mean)\b/i.test(t)
  );
}
