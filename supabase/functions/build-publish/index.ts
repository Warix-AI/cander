type PublishPayload = {
  workspaceId: string;
  projectId: string;
  url?: string | null;
  slug?: string | null;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

function previewUrl(projectId: string, slug?: string | null) {
  if (slug?.trim()) {
    return `https://${slug.trim().toLowerCase().replace(/\s+/g, "-")}.cander.app`;
  }
  return `https://${projectId}.cander.app`;
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

    const payload = (await req.json()) as PublishPayload;
    const workspaceId = payload.workspaceId?.trim();
    const projectId = payload.projectId?.trim();
    if (!workspaceId || !projectId) {
      return new Response(
        JSON.stringify({ error: "workspaceId and projectId required" }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    const url = payload.url?.trim() || previewUrl(projectId, payload.slug);
    const deploymentId = `dep-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const { createClient } = await import(
      "https://esm.sh/@supabase/supabase-js@2.49.1"
    );
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

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

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!project) {
      return new Response(
        JSON.stringify({ error: "Project not found in workspace" }),
        {
          status: 404,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    const { error: deployError } = await supabase.from("deployments").insert({
      id: deploymentId,
      workspace_id: workspaceId,
      project_id: projectId,
      url,
      status: "live",
      version: 1,
      created_at: now,
      updated_at: now,
    });
    if (deployError) throw deployError;

    const { error: projectError } = await supabase
      .from("projects")
      .update({
        status: "published",
        published_url: url,
        updated_at: now,
      })
      .eq("id", projectId)
      .eq("workspace_id", workspaceId);
    if (projectError) throw projectError;

    return new Response(
      JSON.stringify({ url, deploymentId, status: "live" }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "build-publish failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
});
