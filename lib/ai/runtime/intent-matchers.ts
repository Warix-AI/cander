/**
 * Pure intent matchers — no path aliases (safe for node:test).
 */

export function matchNavIntent(
  content: string,
): { target: string; label: string } | null {
  const text = content.trim();
  const patterns: Array<{ re: RegExp; target: string; label: string }> = [
    {
      re: /\b(go to|open|take me to|switch to|show)\b.*\bbuild\b/i,
      target: "build",
      label: "Build",
    },
    {
      re: /\b(go to|open|take me to|switch to|show)\b.*\b(explore|research)\b/i,
      target: "research",
      label: "Explore",
    },
    {
      re: /\b(go to|open|take me to|switch to|show)\b.*\bwork\b/i,
      target: "work",
      label: "Work",
    },
    {
      re: /\b(go to|open|take me to|switch to|show)\b.*\brecents?\b/i,
      target: "recents",
      label: "Recents",
    },
    {
      re: /\b(go to|open|take me to|switch to|show)\b.*\bconnectors?\b/i,
      target: "connectors",
      label: "Connectors",
    },
    {
      re: /\b(go to|open|take me to|switch to|show)\b.*\bsettings?\b/i,
      target: "settings",
      label: "Settings",
    },
    {
      re: /\b(new chat|go home|home chat)\b/i,
      target: "new_chat",
      label: "New Chat",
    },
  ];
  for (const item of patterns) {
    if (item.re.test(text)) return { target: item.target, label: item.label };
  }
  return null;
}

/** “create a new project …” with optional quoted/called name. */
export function matchCreateProjectIntent(content: string): {
  title: string | null;
} | null {
  const text = content.trim();
  if (!/\b(create|make|start|new)\b/i.test(text)) return null;
  if (!/\bprojects?\b/i.test(text)) return null;

  const named =
    text.match(/\b(?:called|named|titled)\s+[“"']([^”"']+)[”"']/i) ||
    text.match(/\b(?:called|named|titled)\s+([A-Za-z0-9][\w\s-]{0,60})/i) ||
    text.match(/\bproject\s+[“"']([^”"']+)[”"']/i);

  const title = named?.[1]?.trim() || null;
  return { title };
}
