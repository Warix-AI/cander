export type HandshakeNavId =
  | "overview"
  | "agents"
  | "capabilities"
  | "permissions"
  | "context"
  | "activity"
  | "analytics";

export const handshakeNav: {
  id: HandshakeNavId;
  label: string;
}[] = [
  { id: "overview", label: "Overview" },
  { id: "agents", label: "Agents" },
  { id: "capabilities", label: "Capabilities" },
  { id: "permissions", label: "Permissions" },
  { id: "context", label: "Context" },
  { id: "activity", label: "Activity" },
  { id: "analytics", label: "Analytics" },
];

export const handshakePositioning =
  "Handshake is the infrastructure that allows businesses and AI agents to securely understand, communicate, and take action together.";

export const handshakeOverview = {
  readinessScore: 92,
  connectedAgents: [{ name: "Courier Agent", status: "Verified" as const }],
  futureProviders: ["ChatGPT", "Claude", "Gemini"],
  activeCapabilities: [
    "Product Search",
    "Appointment Booking",
    "Customer Support",
    "Order Management",
    "Recommendations",
  ],
  recentHandshakes: [
    "Courier requested product availability",
    "Business agent responded with recommendations",
    "Customer approved an action",
  ],
};

export const handshakeAgents = {
  active: {
    name: "Courier",
    status: "Verified Provider" as const,
    capabilities: [
      "Context sharing",
      "Secure communication",
      "Authorized actions",
    ],
  },
  future: [
    { name: "ChatGPT", status: "Coming soon" as const },
    { name: "Claude", status: "Coming soon" as const },
    { name: "Gemini", status: "Coming soon" as const },
  ],
};

export const handshakeCapabilities = {
  disclaimer:
    "Businesses maintain their own MCP tools and APIs. Handshake manages secure access and permissions.",
  items: [
    { name: "Appointment Booking", status: "Active" as const },
    { name: "Product Search", status: "Active" as const },
    { name: "Order Lookup", status: "Active" as const },
    { name: "Refund Request", status: "Requires Approval" as const },
    { name: "Customer Support", status: "Active" as const },
    { name: "Recommendations", status: "Active" as const },
  ],
};

export const handshakePermissions = {
  userContext: {
    allowed: [
      "Preferences",
      "Shopping intent",
      "Calendar availability",
      "Location",
    ],
    restricted: [
      "Private conversations",
      "Payment information",
      "Personal documents",
    ],
  },
  actions: [
    { name: "Booking", mode: "Requires user approval" as const },
    { name: "Purchasing", mode: "Requires user approval" as const },
    { name: "Recommendations", mode: "Automatic" as const },
  ],
};

export const handshakeContext = {
  intent: "Looking for a laptop under $2,000",
  preferences: "Prioritizes battery life and portability",
  history: "Previously compared MacBook Pro and ThinkPad",
  note: "User context is shared only with permission.",
};

export const handshakeActivity = [
  {
    time: "8:42 PM",
    title: "Courier Agent requested product recommendations",
  },
  {
    time: "8:43 PM",
    title: "Business Agent responded",
  },
  {
    time: "8:45 PM",
    title: "Customer approved purchase",
  },
  {
    time: "7:18 PM",
    title: "Courier verified agent identity",
  },
  {
    time: "6:55 PM",
    title: "Context exchange: shopping intent",
  },
];

export const handshakeAnalytics = [
  { label: "Handshake Sessions", value: "12,450" },
  { label: "AI Assisted Conversions", value: "1,240" },
  { label: "Actions Completed", value: "4,850" },
  { label: "Context Exchanges", value: "18,300" },
];

export const handshakeArchitecture = [
  "Customer AI Agent",
  "Handshake",
  "Courier Business Agent",
  "Business MCP Tools / APIs / Systems",
];
