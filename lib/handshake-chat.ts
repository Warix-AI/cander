const replies: { match: string[]; answer: string }[] = [
  {
    match: ["permission", "permissions", "access"],
    answer:
      "Your Handshake permissions allow preferences, shopping intent, calendar availability, and location. Private conversations, payment information, and personal documents are restricted. Booking and purchasing require user approval; recommendations run automatically.",
  },
  {
    match: ["activity", "recent", "timeline", "events"],
    answer:
      "Recent activity: at 8:42 PM Courier Agent requested product recommendations; at 8:43 PM the business agent responded; at 8:45 PM the customer approved a purchase.",
  },
  {
    match: ["ready", "readiness", "score", "ai ready"],
    answer:
      "Your business AI Readiness Score is 92%. Courier Agent is verified and connected. Five capabilities are active: product search, appointment booking, customer support, order management, and recommendations.",
  },
  {
    match: ["capabilit", "connected", "expose", "mcp"],
    answer:
      "Connected capabilities: Appointment Booking, Product Search, Order Lookup (active), Refund Request (requires approval), Customer Support, and Recommendations. Your MCP tools and APIs stay under your control — Handshake governs secure access.",
  },
];

export function handshakeAssistantReply(raw: string) {
  const text = raw.toLowerCase();
  for (const entry of replies) {
    if (entry.match.some((word) => text.includes(word))) return entry.answer;
  }
  return "Ask about permissions, recent activity, AI readiness, or connected capabilities. Handshake is the trust layer between Courier agents and your business systems.";
}
