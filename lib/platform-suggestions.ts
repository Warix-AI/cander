import type { PlatformNav } from "@/lib/types";

export type PlatformSuggestion = {
  id: string;
  label: string;
  prompt: string;
};

/** Short prompts above the Development composer. */
export function platformChatSuggestions(
  nav: PlatformNav | null | undefined,
): PlatformSuggestion[] {
  if (!nav || nav === "recents") {
    return [
      {
        id: "plat-overview",
        label: "Traffic this week",
        prompt: "Summarize traffic and uptime for this workspace this week.",
      },
      {
        id: "plat-models",
        label: "Pick a model",
        prompt: "Which model should I use for a low-latency internal tool?",
      },
      {
        id: "plat-keys",
        label: "Rotate a key",
        prompt: "Walk me through rotating an API key without downtime.",
      },
    ];
  }

  const byNav: Partial<Record<PlatformNav, PlatformSuggestion[]>> = {
    overview: [
      {
        id: "ov-traffic",
        label: "Traffic summary",
        prompt: "Summarize traffic and completion rate for the last 12 weeks.",
      },
      {
        id: "ov-uptime",
        label: "Check uptime",
        prompt: "Anything odd in uptime or error rate I should look at?",
      },
      {
        id: "ov-capacity",
        label: "Capacity limits",
        prompt: "Are we close to any capacity limits on this workspace?",
      },
    ],
    hosting: [
      {
        id: "host-pick",
        label: "Pick a runtime",
        prompt: "Should this workload run on Cloud, Local, or On-device?",
      },
      {
        id: "host-cost",
        label: "Hosting cost",
        prompt: "Compare Cloud vs Local cost for our current traffic mix.",
      },
      {
        id: "host-switch",
        label: "Switch runtime",
        prompt: "How do I switch hosting mode without breaking production?",
      },
    ],
    models: [
      {
        id: "model-pick",
        label: "Recommend model",
        prompt: "Recommend a model for a low-latency internal tool.",
      },
      {
        id: "model-local",
        label: "Local fit",
        prompt: "Which local models fit our hardware for this workspace?",
      },
      {
        id: "model-swap",
        label: "Swap models",
        prompt: "How do I swap the default model for this workspace?",
      },
    ],
    api: [
      {
        id: "api-endpoint",
        label: "Call endpoint",
        prompt: "Show me how to call the completions API from our app.",
      },
      {
        id: "api-errors",
        label: "Debug errors",
        prompt: "What do the most common API error codes mean here?",
      },
      {
        id: "api-rate",
        label: "Rate limits",
        prompt: "What are our API rate limits and how close are we?",
      },
    ],
    keys: [
      {
        id: "key-rotate",
        label: "Rotate a key",
        prompt: "Walk me through rotating an API key without downtime.",
      },
      {
        id: "key-scope",
        label: "Key scopes",
        prompt: "What scopes should a server-side key have for Build?",
      },
      {
        id: "key-audit",
        label: "Audit keys",
        prompt: "Which keys look unused or overly privileged?",
      },
    ],
    deployments: [
      {
        id: "dep-status",
        label: "Deploy status",
        prompt: "Summarize the health of our active deployments.",
      },
      {
        id: "dep-rollback",
        label: "Rollback",
        prompt: "How do I roll back the last production deploy?",
      },
      {
        id: "dep-new",
        label: "New deploy",
        prompt: "Help me ship a new deployment for the marketing site.",
      },
    ],
    logs: [
      {
        id: "logs-errors",
        label: "Recent errors",
        prompt: "Show the most common errors from the last 24 hours.",
      },
      {
        id: "logs-trace",
        label: "Trace a request",
        prompt: "Help me trace a failed request through the logs.",
      },
      {
        id: "logs-spike",
        label: "Latency spike",
        prompt: "Was there a latency spike today, and what caused it?",
      },
    ],
    usage: [
      {
        id: "usage-month",
        label: "This month",
        prompt: "Summarize token and request usage for this month.",
      },
      {
        id: "usage-cost",
        label: "Cost drivers",
        prompt: "What is driving cost the most in this workspace?",
      },
      {
        id: "usage-forecast",
        label: "Forecast",
        prompt: "Are we on track to hit any plan limits this cycle?",
      },
    ],
    docs: [
      {
        id: "docs-start",
        label: "Quick start",
        prompt: "Point me to the quick start for the Platform API.",
      },
      {
        id: "docs-auth",
        label: "Auth guide",
        prompt: "How does API authentication work in Development?",
      },
      {
        id: "docs-local",
        label: "Local runtime",
        prompt: "Where are the docs for running models locally?",
      },
    ],
  };

  return byNav[nav] ?? platformChatSuggestions("overview");
}
