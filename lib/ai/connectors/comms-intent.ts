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

/** Broader send / retry-send intent — includes capability nudges from the user. */
export function looksLikeSendIntent(content: string): boolean {
  const text = (content || "").trim();
  if (!text) return false;
  if (looksLikeSendFollowUp(text)) return true;
  if (looksLikeDirectSendIntent(text)) return true;
  return (
    /\b(can'?t you send|couldn'?t you send|won'?t you send|try (to )?send|actually send|please send|not send(ing)?|send (this|that|the email|the message))\b/i.test(
      text,
    ) ||
    /\b(send tool|sending capability|ability to send|access to send|do you have access)\b/i.test(
      text,
    ) ||
    /\b(try|use|same path|where you).{0,48}\b(read|gmail|send|draft|mail)\b/i.test(
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

export function looksLikeReadSearchIntent(content: string): boolean {
  const text = (content || "").trim();
  if (!text) return false;
  if (looksLikeSendIntent(text)) return false;
  return (
    /\b(check|read|search|find|summarize|show|list|inbox|unread|latest|recent|last email)\b/i.test(
      text,
    ) ||
    /\b(my )?(email|mail|gmail)\b/i.test(text)
  );
}

export function looksClearlyOffTopic(content: string): boolean {
  const text = (content || "").trim();
  if (!text) return false;
  if (/\b(email|gmail|mail|inbox|send|draft|subject)\b/i.test(text)) {
    return false;
  }
  return (
    /\b(weather|sports|football|basketball|recipe|movie|stock|crypto)\b/i.test(
      text,
    ) && !threadHasEmailContext([{ role: "user", content: text }])
  );
}

/** Thread is mid email draft/send workflow — keep routing to Gmail tools. */
export function threadIsActiveEmailConversation(
  messages?: ThreadMessage[],
): boolean {
  if (!messages?.length) return false;
  const recent = [...messages].slice(-14);
  if (threadHasEmailContext(recent)) return true;
  if (inferSendMailFromThread(recent)) return true;
  return recent.some(
    (message) =>
      message.role === "user" && looksLikeSendIntent(message.content || ""),
  );
}

/** True when the user message should run the Gmail connector turn. */
export function isCommsConnectorTurn(
  content: string,
  messages?: ThreadMessage[],
): boolean {
  const text = (content || "").trim();
  if (!text) return false;

  if (looksClearlyOffTopic(text)) return false;

  if (
    /\b(gmail|inbox|e-?mail|emails?|mailbox)\b/i.test(text) ||
    /\b(unread|sent|drafts?)\b[\s\S]{0,32}\b(mail|email|message)/i.test(text) ||
    /\b(check|read|search|find|summarize|show|list)\b[\s\S]{0,40}\b(my )?(email|mail|inbox|gmail)\b/i.test(
      text,
    )
  ) {
    return true;
  }

  if (looksLikeSendIntent(text)) return true;

  if (threadIsActiveEmailConversation(messages)) {
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

export function looksLikeFalseSendClaim(text: string): boolean {
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
  return (
    /\b(email was )?(successfully )?sent\b/i.test(trimmed) ||
    /\bsent (it|the email|your email|the message) to\b/i.test(trimmed) ||
    /\bi (?:have|'ve) sent\b/i.test(trimmed)
  );
}

export function looksLikeFalseSendDenial(text: string): boolean {
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
  return (
    /\b(did not|didn't|do not|don't) have access to gmail\b/i.test(trimmed) ||
    /\bno (email-?sending|send) tool\b/i.test(trimmed) ||
    /\bshould(?:n't| not) have claimed\b/i.test(trimmed) ||
    /\bemail was not sent\b/i.test(trimmed)
  );
}
