/**
 * Explore / chat research escalation.
 * Prefer Brave search → direct fetch → agent-browser. Never start a sandbox for ordinary discovery.
 */

export type WebToolLevel = 1 | 2 | 3;

export type WebEscalationInput = {
  userMessage: string;
  webOpenOk?: boolean;
  webOpenTextLength?: number;
  explicitBrowseIntent?: boolean;
  /** User asked to see / show / open the page in the panel. */
  wantsVisibleTab?: boolean;
};

const BROWSE_INTENT =
  /\b(go to|visit|open in browser|browse|click|log in|sign in|fill|submit|interactive|scroll|screenshot|visual)\b/i;

const SHOW_INTENT =
  /\b(show me|show the|open it|let me see|bring up|display the)\b/i;

const READ_INTENT =
  /\b(read|what does|summarize|tell me about)\b[\s\S]{0,60}\b(page|site|website|url)\b/i;

/** Recommend web tool level for a user turn. Model still chooses; this assists routing. */
export function recommendWebToolLevel(input: WebEscalationInput): WebToolLevel {
  if (input.explicitBrowseIntent || BROWSE_INTENT.test(input.userMessage)) {
    return 3;
  }
  if (input.webOpenOk === false) {
    return 3;
  }
  if (
    input.webOpenOk === true &&
    typeof input.webOpenTextLength === "number" &&
    input.webOpenTextLength < 200
  ) {
    return 3;
  }
  if (READ_INTENT.test(input.userMessage)) {
    return 2;
  }
  return 1;
}

export function toolNameForLevel(level: WebToolLevel): string {
  switch (level) {
    case 1:
      return "web.search";
    case 2:
      return "web.open";
    case 3:
      return "computer.browser.open";
  }
}

export function shouldEscalateToBrowser(opts: {
  webOpenOk: boolean;
  textLength: number;
  userMessage: string;
}): boolean {
  return (
    recommendWebToolLevel({
      userMessage: opts.userMessage,
      webOpenOk: opts.webOpenOk,
      webOpenTextLength: opts.textLength,
      explicitBrowseIntent: BROWSE_INTENT.test(opts.userMessage),
    }) === 3
  );
}

/** Background research should not create a visible tab unless the user asks. */
export function shouldOpenVisibleResearchTab(userMessage: string): boolean {
  return SHOW_INTENT.test(userMessage) || /\bopen (the )?(page|site|url)\b/i.test(userMessage);
}
