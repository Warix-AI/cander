/**
 * Gmail comms routing — detect email turns including send follow-ups.
 */

type ThreadMessage = {
  role: string;
  content: string;
};

export function threadHasEmailContext(messages?: ThreadMessage[]): boolean {
  const recent = [...(messages ?? [])].slice(-10);
  return recent.some((message) =>
    /\b(gmail|inbox|e-?mail|emails?|mailbox|subject:|^to:)\b/im.test(
      message.content || "",
    ),
  );
}

export function looksLikeSendFollowUp(content: string): boolean {
  const text = (content || "").trim();
  if (!text) return false;
  return (
    /^(send(\s+it|\s+that|\s+now|\s+the(\s+email)?|\s+this)?|go ahead|yes,?\s*send|please send)\.?$/i.test(
      text,
    ) ||
    /\b(send(\s+it|\s+that|\s+now|\s+the email|\s+this email)|go ahead and send|please send (it|that|the email))\b/i.test(
      text,
    )
  );
}

export function looksLikeDirectSendIntent(content: string): boolean {
  const text = (content || "").trim();
  if (!text) return false;
  return (
    /\b(send|write|compose|draft)\b[\s\S]{0,48}\b(email|e-?mail|mail|message)\b/i.test(
      text,
    ) ||
    /\b(email|e-?mail|mail)\b[\s\S]{0,32}\b(to|for)\b/i.test(text)
  );
}

/** True when the user message should run the Gmail connector turn. */
export function isCommsConnectorTurn(
  content: string,
  messages?: ThreadMessage[],
): boolean {
  const text = (content || "").trim();
  if (!text) return false;

  if (
    /\b(gmail|inbox|e-?mail|emails?|mailbox)\b/i.test(text) ||
    /\b(unread|sent|drafts?)\b[\s\S]{0,32}\b(mail|email|message)/i.test(text) ||
    /\b(check|read|search|find|summarize|show|list)\b[\s\S]{0,40}\b(my )?(email|mail|inbox|gmail)\b/i.test(
      text,
    )
  ) {
    return true;
  }

  if (looksLikeDirectSendIntent(text)) return true;

  if (looksLikeSendFollowUp(text) && threadHasEmailContext(messages)) {
    return true;
  }

  return false;
}

export function inferSendMailFromThread(
  messages?: ThreadMessage[],
): { to: string; subject: string; body: string } | null {
  const assistantMessages = [...(messages ?? [])]
    .reverse()
    .filter((message) => message.role === "assistant");

  for (const message of assistantMessages) {
    const content = (message.content || "").trim();
    if (!content) continue;

    const toMatch = content.match(/^\s*(?:To|Recipient):\s*(.+)\s*$/im);
    if (!toMatch) continue;

    const to = toMatch[1].replace(/[<>]/g, "").trim();
    const subjectMatch = content.match(/^\s*Subject:\s*(.+)\s*$/im);
    const subject = subjectMatch?.[1]?.trim() ?? "";

    let bodyStart = 0;
    if (subjectMatch) {
      bodyStart = content.indexOf(subjectMatch[0]) + subjectMatch[0].length;
    } else {
      bodyStart = content.indexOf(toMatch[0]) + toMatch[0].length;
    }

    let body = content.slice(bodyStart).trim();
    body = body
      .replace(
        /^i can(?:not|'t) send[\s\S]*?(?:email client:|message is ready to copy:)\s*/i,
        "",
      )
      .trim();

    if (!to) continue;
    if (!subject && body.length < 12) continue;

    return {
      to,
      subject,
      body: body || subject,
    };
  }

  return null;
}
