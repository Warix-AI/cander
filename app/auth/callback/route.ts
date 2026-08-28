import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { safeAuthNextPath } from "@/lib/security";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * OAuth / magic-link / email-verify callback — exchanges `code` for session cookies,
 * then redirects to app home or onboarding resume.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeAuthNextPath(searchParams.get("next"));

  if ((!code && !tokenHash) || !isSupabaseConfigured()) {
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

  let exchangeError: Error | null = null;

  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    exchangeError = result.error;
  } else if (tokenHash && type) {
    const result = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
    });
    exchangeError = result.error;
  }

  if (exchangeError) {
    // Never echo auth secrets into the URL (Referer / history / analytics leak).
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
