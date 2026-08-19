import type { PlatformNav } from "./types";

export type PlatformIntent = {
  nav?: PlatformNav;
  reply: string;
};

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

const surfaces: {
  nav: PlatformNav;
  words: string[];
  reply: string;
}[] = [
  {
    nav: "keys",
    words: ["api key", "api keys", "keys", "key", "token", "secret"],
    reply:
      "Opened Keys. Create and rotate credentials here — keep them out of source.",
  },
  {
    nav: "models",
    words: ["models", "model", "runtime", "gemma"],
    reply:
      "Opened Models. Cloud, local, and on-device runtimes are listed with memory and status.",
  },
  {
    nav: "api",
    words: ["apis", "endpoints", "endpoint", "api"],
    reply:
      "Opened APIs. Enable the license, inspect routes, and see what Courier Platform exposes.",
  },
  {
    nav: "hosting",
    words: ["hosting", "on-device", "on device", "lan"],
    reply:
      "Opened Hosting. Cloud, local, and on-device are the same product with different runtimes.",
  },
  {
    nav: "usage",
    words: ["usage", "quota", "spend", "billing", "invoice"],
    reply:
      "Opened Usage. Cloud is metered; local and on-device are unlimited. Seats and Ultra are in Settings → Plans.",
  },
  {
    nav: "docs",
    words: ["docs", "documentation", "guide", "reference"],
    reply: "Opened Docs. Guides and API reference stay with the platform, not a separate site.",
  },
  {
    nav: "deployments",
    words: ["deployments", "deployment", "deploy", "release"],
    reply: "Opened Deployments. Live and pending releases for this workspace are listed here.",
  },
  {
    nav: "logs",
    words: ["logs", "log", "trace"],
    reply: "Opened Logs. Recent platform traffic and errors are on this page.",
  },
  {
    nav: "overview",
    words: ["overview", "dashboard", "home"],
    reply: "Opened Overview. Traffic, funnel, and runtime mix for Courier Platform.",
  },
  {
    nav: "recents",
    words: ["recents", "recent chats", "history"],
    reply: "Opened Recents. Platform chats from this workspace are listed here.",
  },
];

export function inferPlatformIntent(raw: string): PlatformIntent {
  const text = raw.toLowerCase().trim();

  if (includesAny(text, ["undo", "revert"])) {
    return {
      reply:
        "Platform chat doesn’t keep a preview timeline. Ask me to open models, keys, hosting, or another page instead.",
    };
  }

  const hit = surfaces.find((item) => includesAny(text, item.words));
  if (hit) return { nav: hit.nav, reply: hit.reply };

  return {
    reply:
      "I can help with APIs, keys, hosting, deployments, and docs. Pro also has models, logs, and usage. Ask to open any of those.",
  };
}
