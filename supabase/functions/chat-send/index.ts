type ChatBlock = Record<string, unknown>;

type MessagePayload = {
  id: string;
  role: "assistant";
  content: string;
  at: string;
  blocks?: ChatBlock[];
};

function classify(content: string) {
  const lower = content.toLowerCase();
  if (/research|browse|source/.test(lower)) return "research";
  if (/skill|automation|workflow/.test(lower)) return "skill";
  if (/build|create|make|app|site/.test(lower)) return "build";
  return "chat";
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function composeReply(content: string, spaceId?: string | null): MessagePayload {
  const kind = classify(content);
  const space = spaceId ? ` in ${spaceId}` : "";

  if (kind === "research") {
    return {
      id: `a-${crypto.randomUUID().slice(0, 8)}`,
      role: "assistant",
      content: `I'll gather sources${space} and summarize what matters.`,
      at: nowTime(),
      blocks: [
        {
          type: "text",
          text: "Scanning connected sources and open tabs.",
        },
      ],
    };
  }

  if (kind === "skill") {
    return {
      id: `a-${crypto.randomUUID().slice(0, 8)}`,
      role: "assistant",
      content: `I'll draft a skill${space} you can refine in the editor.`,
      at: nowTime(),
    };
  }

  if (kind === "build") {
    return {
      id: `a-${crypto.randomUUID().slice(0, 8)}`,
      role: "assistant",
      content: `On it — I'll update the preview${space} when the change is ready.`,
      at: nowTime(),
      blocks: [
        {
          type: "build",
          title: "Working",
          items: [
            { id: "1", label: "Planning change", status: "active" },
            { id: "2", label: "Updating preview", status: "pending" },
          ],
        },
      ],
    };
  }

  return {
    id: `a-${crypto.randomUUID().slice(0, 8)}`,
    role: "assistant",
    content: `Got it${space}. Tell me if you want this turned into a project or kept as chat.`,
    at: nowTime(),
  };
}

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
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import(
      "https://esm.sh/@supabase/supabase-js@2.49.1"
    );
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as {
      threadId?: string;
      workspaceId?: string;
      content?: string;
      spaceId?: string | null;
    };

    const content = body.content?.trim() ?? "";
    if (!content) {
      return new Response(JSON.stringify({ error: "content required" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Stub remains write-less; JWT gate prevents anonymous abuse.
    const message = composeReply(content, body.spaceId);

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "chat-send failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      },
    );
  }
});
