import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * OAuth / magic-link / email-verify callback — exchanges `code` for session cookies,
 * then redirects to app home or onboarding resume.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/";
  const next = nextRaw.startsWith("/") ? nextRaw : "/";

  if (!code || !isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  const cookieStore = await cookies();
  const pendingCookies: CookieToSet[] = [];

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        pendingCookies.push(...cookiesToSet);
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  let destination = next;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && next === "/") {
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
      destination = "/?auth=verified";
    }
  }

  const response = NextResponse.redirect(`${origin}${destination}`);
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}
