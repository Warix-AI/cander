export type HandshakeNavId =
  | "overview"
  | "agents"
  | "connections"
  | "capabilities"
  | "context"
  | "conversations"
  | "transactions"
  | "security"
  | "settings";

export const handshakeNav: { id: HandshakeNavId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "agents", label: "Agents" },
  { id: "connections", label: "Connections" },
  { id: "capabilities", label: "Capabilities" },
  { id: "context", label: "Context" },
  { id: "conversations", label: "Conversations" },
  { id: "transactions", label: "Transactions" },
  { id: "security", label: "Security" },
  { id: "settings", label: "Settings" },
];

export const handshakePositioning =
  "Handshake is the infrastructure that allows businesses and AI agents to securely understand, communicate, and take action together.";

export const handshakeStatus = {
  state: "ACTIVE" as const,
  headline: "Connect Handshake to let agents work with your business.",
  stats: [
    { label: "Connected Agents", value: "0" },
    { label: "Capabilities", value: "0" },
    { label: "Actions Completed", value: "0" },
    { label: "Revenue Influenced", value: "$0" },
  ],
};

export type ArchitectureLayerId =
  | "customer-agent"
  | "handshake"
  | "business-agent"
  | "mcp";

export const handshakeArchitectureLayers: {
  id: ArchitectureLayerId;
  label: string;
  details: { label: string; value: string }[];
}[] = [
  {
    id: "customer-agent",
    label: "Customer AI Agent",
    details: [
      { label: "Provider", value: "One AI" },
      { label: "Identity", value: "Verified · Agent ID #A-20491" },
      { label: "Permissions", value: "Context read · Action request" },
    ],
  },
  {
    id: "handshake",
    label: "Handshake",
    details: [
      { label: "Role", value: "AI interaction infrastructure" },
      { label: "Trust", value: "End-to-end verified channel" },
      { label: "Policy", value: "User approval on sensitive actions" },
    ],
  },
  {
    id: "business-agent",
    label: "Business Agent",
    details: [
      { label: "Model", value: "Business v2" },
      { label: "Knowledge", value: "Products · Policies · Brand voice" },
      { label: "Tools", value: "12 connected capabilities" },
    ],
  },
  {
    id: "mcp",
    label: "Business MCP Tools / APIs / Systems",
    details: [
      { label: "Connected systems", value: "Shopify · Salesforce · Calendly" },
      { label: "MCP servers", value: "3 active" },
      { label: "Custom APIs", value: "2 internal endpoints" },
    ],
  },
];

export const handshakeProviders = [
  {
    name: "One AI",
    status: "Verified" as const,
    trust: "Active",
    requests: "12,450",
    permissions: "Full capability access",
  },
  {
    name: "ChatGPT",
    status: "Pending Approval" as const,
    trust: "Review required",
    requests: "—",
    permissions: "Limited · pending review",
  },
  {
    name: "Claude",
    status: "Not Connected" as const,
    trust: "—",
    requests: "—",
    permissions: "—",
  },
  {
    name: "Gemini",
    status: "Not Connected" as const,
    trust: "—",
    requests: "—",
    permissions: "—",
  },
];

export const handshakeConnectionCategories = [
  "Commerce",
  "CRM",
  "Calendar",
  "Support",
  "Database",
  "Custom MCP",
];

export const handshakeConnections: {
  name: string;
  category: string;
  status: "Connected";
  capabilities: number;
}[] = [];

export const handshakeCapabilities = {
  intro:
    "Capabilities are the public-facing AI API layer — what customer agents can request from your business.",
  items: [
    {
      name: "Product Discovery",
      status: "Enabled" as const,
      description: "Search catalog and match products to customer intent.",
      permissions: "Automatic",
      connectedSystem: "Shopify Commerce",
      usage: "4,820",
    },
    {
      name: "Availability Checking",
      status: "Enabled" as const,
      description: "Real-time inventory and appointment slot lookup.",
      permissions: "Automatic",
      connectedSystem: "Booking System",
      usage: "3,294",
    },
    {
      name: "Appointment Scheduling",
      status: "Enabled" as const,
      description: "Book meetings and service appointments on behalf of users.",
      permissions: "User approval required",
      connectedSystem: "Calendly",
      usage: "2,300",
    },
    {
      name: "Order Modification",
      status: "Requires Approval" as const,
      description: "Change, cancel, or refund existing orders.",
      permissions: "User approval required",
      connectedSystem: "Shopify Commerce",
      usage: "740",
    },
    {
      name: "Customer Support",
      status: "Enabled" as const,
      description: "Answer policy and product questions using business knowledge.",
      permissions: "Automatic",
      connectedSystem: "Internal APIs",
      usage: "6,120",
    },
    {
      name: "Recommendations",
      status: "Enabled" as const,
      description: "Personalized product and service suggestions.",
      permissions: "Automatic",
      connectedSystem: "Shopify Commerce",
      usage: "12,400",
    },
  ],
};

export const handshakeContextData = {
  user: {
    allowed: ["Preferences", "Intent", "Location", "Previous interactions"],
    restricted: [
      "Personal messages",
      "Financial information",
      "Private files",
    ],
    live: {
      intent: "Looking for a laptop under $2,500 for video editing",
      preferences: "Prioritizes battery life and portability",
      history: "Compared MacBook Pro and ThinkPad last week",
    },
  },
  business: {
    items: [
      { label: "Brand voice", value: "Friendly, expert, concise" },
      { label: "Pricing rules", value: "No discounts below MAP without approval" },
      { label: "Policies", value: "30-day returns · Free shipping over $50" },
      { label: "Product knowledge", value: "847 SKUs indexed · Updated daily" },
      {
        label: "Customer service guidelines",
        value: "Escalate billing disputes to human within 2 min",
      },
    ],
    knowledge: ["Products", "Policies", "FAQs", "Brand voice"],
  },
  rules: {
    canSay: [
      "Product availability and pricing within published rules",
      "Appointment options from connected calendar systems",
      "Policy answers sourced from verified business knowledge",
    ],
    cannotDo: [
      "Access payment methods without explicit user approval",
      "Modify orders without confirmation",
      "Share restricted customer context with unverified agents",
    ],
  },
};

export const handshakeConversations: {
  id: string;
  time: string;
  customerMessage: string;
  businessMessage: string;
  action: string;
}[] = [];

export const handshakeTransactions = {
  headline: "Handshake Impact",
  stats: [
    { label: "AI influenced revenue", value: "$0" },
    { label: "Completed actions", value: "0" },
    { label: "Conversion rate", value: "—" },
  ],
  completedActions: [] as { name: string; value: string }[],
  topInteractions: [] as string[],
};

export const handshakeSecurity = {
  verification: [
    { provider: "One AI", status: "Verified", level: "Full trust" },
    { provider: "ChatGPT", status: "Pending", level: "Under review" },
  ],
  permissions: {
    userContext: {
      allowed: ["Preferences", "Intent", "Location", "Previous interactions"],
      restricted: [
        "Personal messages",
        "Financial information",
        "Private files",
      ],
    },
    actions: [
      { name: "Booking", mode: "Requires user approval" as const },
      { name: "Purchasing", mode: "Requires user approval" as const },
      { name: "Recommendations", mode: "Automatic" as const },
    ],
  },
  accessPolicies: [
    "Unverified agents cannot access customer context",
    "Sensitive actions require explicit user approval",
    "Business knowledge is read-only for customer agents",
  ],
  auditLogs: [
    { time: "8:45 PM", event: "Customer approved purchase action" },
    { time: "8:43 PM", event: "Business agent responded to capability request" },
    { time: "7:18 PM", event: "Agent identity verified" },
  ],
  apiKeys: [{ name: "Production", prefix: "hs_live_••••••••", lastUsed: "2 min ago" }],
  encryption: "AES-256 at rest · TLS 1.3 in transit",
  compliance: ["SOC 2 Type II (in progress)", "GDPR-ready data handling"],
};

export const handshakeSettings = {
  account: "",
  status: "Not connected" as const,
  connectedSince: "—",
  notifications: true,
  autoApproveRecommendations: false,
  webhookUrl: "",
};
