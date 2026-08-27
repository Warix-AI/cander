import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type BriefingPayload = {
  workspaceId: string;
  connectorId?: string | null;
};

type BriefingTemplate = {
  id: string;
  connectorId?: string;
  tone: "urgent" | "waiting" | "ready" | "neutral";
  title: string;
  summary: string;
  prompt?: string;
};

const TEMPLATES: BriefingTemplate[] = [
  {
    id: "w-northwind-reply",
    connectorId: "gmail",
    tone: "urgent",
    title: "Northwind — pricing note",
    summary: "They asked for seat vs usage clarity before tomorrow's call.",
    prompt:
      "Draft a reply to Northwind's pricing note — keep it clear on seat vs usage.",
  },
  {
    id: "w-slack-threads",
    connectorId: "slack",
    tone: "urgent",
    title: "Two Slack threads waiting",
    summary: "#launch and #design need your take on the hero cut.",
    prompt:
      "Summarize the two Slack threads waiting on me and draft short replies.",
  },
  {
    id: "w-launch-sync",
    connectorId: "gcal",
    tone: "ready",
    title: "2:00 PM — Launch sync",
    summary: "Open questions from last week and the Cander publish checklist.",
    prompt:
      "Prep me for the 2 PM launch sync — open questions and last week's notes.",
  },
  {
    id: "w-vendor-invoice",
    connectorId: "gmail",
    tone: "waiting",
    title: "Vendor invoice — Figma",
    summary: "You asked finance for a PO; no reply since Monday.",
    prompt:
      "Draft a polite nudge to finance about the Figma PO I requested Monday.",
  },
  {
    id: "w-handshake-review",
    connectorId: "handshake",
    tone: "neutral",
    title: "Handshake capability review",
    summary: "Three agent requests need approval before end of day.",
    prompt: "Summarize pending Handshake capability requests and recommend approvals.",
  },
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const payload = (await req.json()) as BriefingPayload;
    const workspaceId = payload.workspaceId?.trim();
    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "workspaceId required" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const templates = TEMPLATES.filter((item) => {
      if (payload.connectorId && item.connectorId !== payload.connectorId) {
        return false;
      }
      return true;
    });

    const rows = templates.map((item) => ({
      id: item.id,
      workspace_id: workspaceId,
      connector_id: item.connectorId ?? null,
      tone: item.tone,
      title: item.title,
      summary: item.summary,
      prompt: item.prompt ?? null,
      action_type: null,
      external_id: null,
      snoozed_until: null,
      version: 1,
    }));

    if (rows.length) {
      const { error } = await supabase
        .from("briefing_items")
        .upsert(rows, { onConflict: "id" });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ synced: rows.length }), {
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "briefing-sync failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
});
