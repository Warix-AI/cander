import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth / magic-link / email-verify callback — exchanges `code` for session cookies,
 * then redirects to app home or onboarding resume.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/";
  const next = nextRaw.startsWith("/") ? nextRaw : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  let destination = next;
  if (next === "/") {
    try {
      const admin = createSupabaseAdminClient();
      const { data: profile } = await admin
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.onboarding_completed_at) {
        destination = "/?auth=verified";
      }
    } catch {
      // Missing service role or migration — default to onboarding resume.
      destination = "/?auth=verified";
    }
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
