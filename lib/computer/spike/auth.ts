import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export async function requireComputerAuth(
  request: Request,
): Promise<{ userId: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  if (token) {
    const userClient = createClient(supabaseUrl(), supabaseAnonKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error,
    } = await userClient.auth.getUser();

    if (!error && user) {
      return { userId: user.id };
    }
  }

  // EventSource cannot send Authorization headers — fall back to cookie session.
  try {
    const cookieClient = await createSupabaseServerClient();
    if (cookieClient) {
      const {
        data: { user },
      } = await cookieClient.auth.getUser();
      if (user) {
        return { userId: user.id };
      }
    }
  } catch {
    // Cookie auth unavailable in this context.
  }

  if (
    process.env.NODE_ENV === "development" &&
    process.env.VERCEL_ENV !== "production"
  ) {
    const devUserId = process.env.COMPUTER_DEV_USER_ID?.trim();
    if (devUserId) {
      return { userId: devUserId };
    }
  }

  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}
