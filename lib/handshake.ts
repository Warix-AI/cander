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
  headline: "Your business is connected to the AI ecosystem.",
  stats: [
    { label: "Connected Agents", value: "4" },
    { label: "Capabilities", value: "24" },
    { label: "Actions Completed", value: "18,492" },
    { label: "Revenue Influenced", value: "$240,000" },
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
      { label: "Provider", value: "Courier" },
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
    label: "Courier Business Agent",
    details: [
      { label: "Model", value: "Courier Business v2" },
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
    name: "Courier",
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

export const handshakeConnections = [
  {
    name: "Shopify Commerce",
    category: "Commerce",
    status: "Connected" as const,
    capabilities: 12,
  },
  {
    name: "Salesforce CRM",
    category: "CRM",
    status: "Connected" as const,
    capabilities: 8,
  },
  {
    name: "Booking System",
    category: "Calendar",
    status: "Connected" as const,
    capabilities: 4,
  },
  {
    name: "HubSpot",
    category: "CRM",
    status: "Connected" as const,
    capabilities: 6,
  },
  {
    name: "Internal APIs",
    category: "Custom MCP",
    status: "Connected" as const,
    capabilities: 5,
  },
  {
    name: "MCP Servers",
    category: "Custom MCP",
    status: "Connected" as const,
    capabilities: 3,
  },
];

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

export const handshakeConversations = [
  {
    id: "23948",
    time: "Today · 8:42 PM",
    customerMessage:
      "I need a laptop for video editing under $2500",
    businessMessage:
      "Based on your requirements, these three models match your needs.",
    action: "Added recommendation",
  },
  {
    id: "23941",
    time: "Today · 7:18 PM",
    customerMessage: "Can I reschedule my appointment to Thursday?",
    businessMessage: "Thursday at 2:00 PM and 4:30 PM are available.",
    action: "Offered scheduling options",
  },
  {
    id: "23902",
    time: "Yesterday · 4:55 PM",
    customerMessage: "What's your return policy on opened electronics?",
    businessMessage:
      "Opened electronics can be returned within 30 days with receipt.",
    action: "Answered from business knowledge",
  },
  {
    id: "23888",
    time: "Yesterday · 2:12 PM",
    customerMessage: "I'd like to upgrade my order to express shipping.",
    businessMessage: "Express shipping is available for $14.99.",
    action: "Pending user approval",
  },
];

export const handshakeTransactions = {
  headline: "Handshake Impact",
  stats: [
    { label: "AI influenced revenue", value: "$1.2M" },
    { label: "Completed actions", value: "48,292" },
    { label: "Conversion rate", value: "18%" },
  ],
  completedActions: [
    { name: "Product Recommendations", value: "12,400" },
    { name: "Appointments Booked", value: "2,300" },
    { name: "Purchases Assisted", value: "740" },
    { name: "Revenue Influenced", value: "$184,000" },
  ],
  topInteractions: [
    "Product recommendations",
    "Scheduling",
    "Support",
  ],
};

export const handshakeSecurity = {
  verification: [
    { provider: "Courier", status: "Verified", level: "Full trust" },
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
    { time: "7:18 PM", event: "Courier agent identity verified" },
  ],
  apiKeys: [{ name: "Production", prefix: "hs_live_••••••••", lastUsed: "2 min ago" }],
  encryption: "AES-256 at rest · TLS 1.3 in transit",
  compliance: ["SOC 2 Type II (in progress)", "GDPR-ready data handling"],
};

export const handshakeSettings = {
  account: "Acme Corp",
  status: "Connected" as const,
  connectedSince: "Aug 12, 2026",
  notifications: true,
  autoApproveRecommendations: false,
  webhookUrl: "https://api.acme.com/handshake/webhook",
};
