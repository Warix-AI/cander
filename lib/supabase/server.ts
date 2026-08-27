import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Server Supabase client (RSC, route handlers). Returns null when not configured. */
export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured()) return null;

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll from a Server Component — middleware will refresh sessions.
        }
      },
    },
  });
}
