import type { ChatBlock, Checkpoint, PreviewNodeId } from "./types";
import { nextId } from "./intent";

export type TurnKind =
  | "build"
  | "refine"
  | "undo"
  | "connect"
  | "secret"
  | "deploy"
  | "skill"
  | "research"
  | "why"
  | "fix"
  | "error"
  | "changes"
  | "chat";

const now = () =>
  new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function classifyTurn(raw: string): TurnKind {
  const text = raw.toLowerCase();
  if (/(undo|roll back|restore|revert)/.test(text)) return "undo";
  if (/(fix automatically|fix this|fix these|repair)/.test(text)) return "fix";
  if (/(preview (failed|crash)|broke|won't load|doesn.?t load|runtime error|build error)/.test(text))
    return "error";
  if (/(view changes|what changed|show me what changed)/.test(text)) return "changes";
  if (/(why did we|why did you|project memory|how did we)/.test(text)) return "why";
  if (/(publish|deploy|go live|make it live)/.test(text)) return "deploy";
  if (/(api key|secret|env var)/.test(text)) return "secret";
  if (/(connect |stripe|supabase|clerk|vercel|resend|github|firebase|neon|cloudflare|openai|anthropic)/.test(text) &&
    /(connect|add|integrate|set up)/.test(text))
    return "connect";
  if (/(accessibility|seo audit|security review|performance|mobile responsive|landing page optimization|database architecture)/.test(text) ||
    text.startsWith("run "))
    return "skill";
  if (/(research|look up|best onboarding)/.test(text) && /(research|look|learn|best)/.test(text))
    return "research";
  if (/(build|create|make me|make a|landing|crm|app for|website|add auth|authentication|database)/.test(text))
    return "build";
  if (/(make this|move this|change this|smaller|bigger|color|redesign|remove this|duplicate)/.test(text))
    return "refine";
  return "chat";
}

export function friendlyTitle(text: string, selected?: PreviewNodeId | null) {
  const lower = text.toLowerCase();
  if (selected) return `Updated the ${labelFor(selected)}`;
  if (/(auth|sign.?in|login)/.test(lower)) return "Added user authentication";
  if (/(crm|landscap)/.test(lower)) return "Created your landscaping CRM";
  if (/(landing|hero|page)/.test(lower)) return "Redesigned the landing page";
  if (/(mobile|responsive)/.test(lower)) return "Made it work on phones";
  if (/(database|data)/.test(lower)) return "Connected a database";
  if (/(stripe|pay)/.test(lower)) return "Connected payments";
  return "Updated your product";
}

export function labelFor(id: PreviewNodeId) {
  const map: Record<PreviewNodeId, string> = {
    nav: "navigation",
    kicker: "eyebrow",
    heading: "headline",
    body: "supporting copy",
    cta: "button",
  };
  return map[id];
}

export function planFor(text: string, selected?: PreviewNodeId | null): ChatBlock[] {
  const title = friendlyTitle(text, selected);
  if (selected) {
    return [
      {
        type: "plan",
        title: `Adjusting the ${labelFor(selected)}`,
        steps: [
          `Change the ${labelFor(selected)} as asked`,
          "Keep the rest of the page as-is",
          "Refresh Preview",
        ],
        details: `Selected: ${selected}`,
      },
    ];
  }
  const lower = text.toLowerCase();
  const auth = /(auth|sign.?in|login|account)/.test(lower);
  return [
    {
      type: "plan",
      title: title.replace(/^(Added|Created|Redesigned|Updated|Made|Connected)/, "Plan"),
      steps: auth
        ? ["Add a sign-in screen", "Let people create an account", "Keep them signed in", "Refresh Preview"]
        : ["Sketch the main screens", "Put the first version in Preview", "Leave room to grow"],
      details: "We'll handle files, install, and Preview. You can ask to see details anytime.",
    },
  ];
}

export function buildCard(text: string, selected?: PreviewNodeId | null): ChatBlock {
  const auth = /(auth|sign.?in|login|account)/.test(text.toLowerCase());
  const items = selected
    ? [
        { id: "s1", label: `Updated the ${labelFor(selected)}`, status: "active" as const },
        { id: "s2", label: "Updating Preview", status: "pending" as const },
      ]
    : auth
      ? [
          { id: "s1", label: "Created sign-in interface", status: "active" as const },
          { id: "s2", label: "Added account creation", status: "pending" as const },
          { id: "s3", label: "Connected authentication", status: "pending" as const },
          { id: "s4", label: "Updating Preview", status: "pending" as const },
        ]
      : [
          { id: "s1", label: "Created the first screens", status: "active" as const },
          { id: "s2", label: "Added your core pages", status: "pending" as const },
          { id: "s3", label: "Updating Preview", status: "pending" as const },
        ];
  return {
    type: "build",
    title: selected ? `Updating the ${labelFor(selected)}` : auth ? "Building authentication" : "Building your app",
    items,
    details: selected
      ? `preview/${selected}.tsx`
      : auth
        ? "app/login/page.tsx · app/signup/page.tsx · lib/auth.ts"
        : "app/page.tsx · app/layout.tsx · components/Hero.tsx",
  };
}

export function suggestionsFor(text: string): ChatBlock {
  const lower = text.toLowerCase();
  const actions = /(auth|sign)/.test(lower)
    ? [
        { id: "database", label: "Connect a database" },
        { id: "mobile", label: "Make it mobile responsive" },
      ]
    : /(crm|landscap)/.test(lower)
      ? [
          { id: "auth", label: "Add authentication" },
          { id: "database", label: "Connect a database" },
          { id: "mobile", label: "Make it mobile responsive" },
        ]
      : [
          { id: "auth", label: "Add authentication" },
          { id: "stripe", label: "Connect Stripe" },
          { id: "mobile", label: "Make it mobile responsive" },
        ];
  return {
    type: "suggestions",
    prompt: "Suggested next steps",
    actions: actions.slice(0, 3),
  };
}

export function makeCheckpoint(text: string, selected?: PreviewNodeId | null): Checkpoint {
  return {
    id: nextId("cp"),
    title: friendlyTitle(text, selected),
    at: now(),
    day: "Today",
    summary: selected
      ? `Updated the ${labelFor(selected)} and refreshed Preview.`
      : "Updated the product and refreshed Preview.",
    files: selected
      ? [`preview/${selected}.tsx`]
      : ["app/page.tsx", "components/Hero.tsx"],
    diff: selected
      ? `- font-size: 2.4rem\n+ font-size: 1.85rem`
      : `+ export function Hero() {\n+   return <h1>Welcome</h1>\n+ }`,
  };
}

export function connectService(text: string) {
  const map: [RegExp, string, string][] = [
    [/stripe/, "Stripe", "STRIPE_SECRET_KEY"],
    [/supabase/, "Supabase", "SUPABASE_URL"],
    [/clerk/, "Clerk", "CLERK_SECRET_KEY"],
    [/vercel/, "Vercel", "VERCEL_TOKEN"],
    [/resend/, "Resend", "RESEND_API_KEY"],
    [/github/, "GitHub", "GITHUB_TOKEN"],
    [/openai/, "OpenAI", "OPENAI_API_KEY"],
    [/anthropic/, "Anthropic", "ANTHROPIC_API_KEY"],
    [/neon/, "Neon", "DATABASE_URL"],
    [/firebase/, "Firebase", "FIREBASE_API_KEY"],
    [/cloudflare/, "Cloudflare", "CLOUDFLARE_TOKEN"],
  ];
  const hit = map.find(([re]) => re.test(text.toLowerCase()));
  return { service: hit?.[1] ?? "Stripe", keyName: hit?.[2] ?? "STRIPE_SECRET_KEY" };
}

export function skillReply(text: string): { content: string; blocks: ChatBlock[] } {
  const lower = text.toLowerCase();
  if (/(seo)/.test(lower)) {
    return {
      content: "I ran an SEO pass. The page title is generic, the hero has no description, and the primary heading could name the product. I can apply those without touching the layout.",
      blocks: [
        {
          type: "suggestions",
          prompt: "Apply the review?",
          actions: [
            { id: "seo-fix", label: "Apply SEO fixes" },
            { id: "seo-details", label: "Show the full notes" },
          ],
        },
      ],
    };
  }
  if (/(accessib)/.test(lower)) {
    return {
      content: "I ran an accessibility review. Contrast on the headline is fine. The main button needs a clearer focus ring, and the hero image needs alt text.",
      blocks: [
        {
          type: "suggestions",
          prompt: "Apply the review?",
          actions: [
            { id: "a11y-fix", label: "Fix these for me" },
            { id: "a11y-details", label: "Show the full notes" },
          ],
        },
      ],
    };
  }
  return {
    content: "I ran that check. A few small polish items, nothing blocking. Say the word and I’ll apply them.",
    blocks: [
      {
        type: "suggestions",
        prompt: "Next",
        actions: [{ id: "apply-skill", label: "Apply the recommendations" }],
      },
    ],
  };
}

export function researchReply(): { content: string; blocks: ChatBlock[] } {
  return {
    content:
      "Modern SaaS onboarding that converts tends to: one job on the first screen, delay account creation until value is obvious, and show a live product — not a tour. I can apply that here.",
    blocks: [
      {
        type: "suggestions",
        prompt: "Use this research?",
        actions: [
          { id: "apply-research", label: "Apply it to my onboarding" },
          { id: "keep-looking", label: "Keep researching" },
        ],
      },
    ],
  };
}
