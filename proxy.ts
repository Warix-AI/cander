import { type NextRequest, NextResponse } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { isValidSubdomainLabel } from "@/lib/build/subdomain";

/**
 * Next.js 16 "proxy" (formerly middleware).
 * Runs before routes — keep this light.
 */
export async function proxy(request: NextRequest) {
  const hostHeader = request.headers.get("host") || "";
  const hostname = request.nextUrl.hostname.toLowerCase();
  const pathname = request.nextUrl.pathname;

  const isCanderTenant =
    hostname.endsWith(".cander.app") &&
    hostname !== "cander.app" &&
    hostname !== "www.cander.app";

  // Platform: skip session work for Next static (matcher includes /_next/static
  // so tenant hosts can proxy those paths).
  if (!isCanderTenant && pathname.startsWith("/_next/static")) {
    return NextResponse.next();
  }

  // Unify local origins so auth cookies + HMR match `npm run dev` (localhost).
  // Cursor Simple Browser often opens 127.0.0.1; without this, sessions split
  // and Next may block /_next chunks (dead Welcome / Sign in UI).
  const isLoopbackIp =
    hostname === "127.0.0.1" || hostHeader.startsWith("127.0.0.1");
  if (isLoopbackIp) {
    const url = request.nextUrl.clone();
    url.hostname = "localhost";
    const port = hostHeader.includes(":")
      ? hostHeader.split(":")[1]
      : request.nextUrl.port;
    if (port) url.port = port;
    return NextResponse.redirect(url);
  }

  // Shared markdown docs: https://{m…}.cander.app → /d/{id}
  // Draft app previews: https://draft--{sub}.cander.app → preview-host proxy
  // Production apps: https://{sub}.cander.app → publish-host proxy (Phase 8)
  if (isCanderTenant) {
    const sub = hostname.slice(0, -".cander.app".length);
    if (/^m[a-z0-9]{24}$/.test(sub)) {
      const url = request.nextUrl.clone();
      url.pathname = `/d/${sub}`;
      return NextResponse.rewrite(url);
    }
    if (/^draft--[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(sub)) {
      const slug = sub.slice("draft--".length);
      const url = request.nextUrl.clone();
      const suffix = pathname === "/" ? "" : pathname;
      url.pathname = `/api/preview-host/${slug}${suffix}`;
      return NextResponse.rewrite(url);
    }
    if (isValidSubdomainLabel(sub)) {
      const url = request.nextUrl.clone();
      const suffix = pathname === "/" ? "" : pathname;
      url.pathname = `/api/publish-host/${sub}${suffix}`;
      return NextResponse.rewrite(url);
    }
  }

  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    // Include /_next/static so tenant *.cander.app hosts can proxy app assets.
    // Platform static is short-circuited in proxy() above.
    "/((?!_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
