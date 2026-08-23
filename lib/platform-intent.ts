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
      "Opened Keys. Credentials are managed here — Courier provisions them for your projects.",
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
      "Opened APIs. Routes are already wired — inspect what this workspace exposes.",
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
      "Opened Usage. Cloud is metered; local and on-device are unlimited. Per-seat plan billing is in Settings → Plans.",
  },
  {
    nav: "docs",
    words: ["docs", "documentation", "guide", "reference"],
    reply: "Opened Docs. Guides and API reference stay in Courier, not a separate site.",
  },
  {
    nav: "deployments",
    words: ["deployments", "deployment", "deploy", "release"],
    reply: "Opened Deployments. Live and pending releases for this workspace are listed here.",
  },
  {
    nav: "logs",
    words: ["logs", "log", "trace"],
    reply: "Opened Logs. Recent development traffic and errors are on this page.",
  },
  {
    nav: "overview",
    words: ["overview", "dashboard", "home"],
    reply: "Opened Overview. Traffic, funnel, and runtime mix for Development.",
  },
  {
    nav: "recents",
    words: ["recents", "recent chats", "history"],
    reply: "Opened Recents. Development chats from this workspace are listed here.",
  },
];

export function inferPlatformIntent(raw: string): PlatformIntent {
  const text = raw.toLowerCase().trim();

  if (includesAny(text, ["undo", "revert"])) {
    return {
      reply:
        "Development chat doesn’t keep a preview timeline. Ask me to open models, keys, hosting, or another page instead.",
    };
  }

  const hit = surfaces.find((item) => includesAny(text, item.words));
  if (hit) return { nav: hit.nav, reply: hit.reply };

  return {
    reply:
      "I can help with APIs, keys, hosting, and an explore model set. Max adds the full catalog, docs, team deploys, and richer logs. Ultra adds production. Ask to open any page.",
  };
}
