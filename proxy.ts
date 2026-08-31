import { type NextRequest, NextResponse } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 "proxy" (formerly middleware).
 * Runs before routes — keep this light.
 */
export async function proxy(request: NextRequest) {
  // Unify local origins so auth cookies + HMR match `npm run dev` (localhost).
  // Cursor Simple Browser often opens 127.0.0.1; without this, sessions split
  // and Next may block /_next chunks (dead Welcome / Sign in UI).
  const hostHeader = request.headers.get("host") || "";
  const isLoopbackIp =
    request.nextUrl.hostname === "127.0.0.1" ||
    hostHeader.startsWith("127.0.0.1");
  if (isLoopbackIp) {
    const url = request.nextUrl.clone();
    url.hostname = "localhost";
    // Preserve explicit port from Host when present.
    const port = hostHeader.includes(":")
      ? hostHeader.split(":")[1]
      : request.nextUrl.port;
    if (port) url.port = port;
    return NextResponse.redirect(url);
  }

  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
