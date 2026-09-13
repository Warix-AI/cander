/**
 * POST /api/auth/events — record signup / auth funnel attribution.
 * Public (rate-soft): accepts client acquisition context; IP/geo from headers.
 */

import { NextResponse } from "next/server";
import type { AuthEventType } from "@/lib/auth/acquisition";
import {
  clientIpFromHeaders,
  geoFromHeaders,
  writeAuthEvent,
} from "@/lib/auth/record-auth-event";

export const runtime = "nodejs";

const ALLOWED: ReadonlySet<AuthEventType> = new Set([
  "visit",
  "signup_started",
  "signup_created",
  "signup_existing",
  "email_verified",
  "signed_in",
  "onboarding_completed",
  "password_reset_requested",
]);

type Body = {
  eventType?: string;
  email?: string | null;
  profileId?: string | null;
  provider?: string | null;
  acquisition?: {
    landingUrl?: string;
    landingPath?: string;
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    gclid?: string;
    fbclid?: string;
    timezone?: string;
    locale?: string;
    screenWidth?: number | null;
    screenHeight?: number | null;
  } | null;
  metadata?: Record<string, unknown>;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = body.eventType as AuthEventType | undefined;
  if (!eventType || !ALLOWED.has(eventType)) {
    return NextResponse.json({ error: "Invalid eventType" }, { status: 400 });
  }

  const acquisition = body.acquisition ?? {};
  const geo = geoFromHeaders(request.headers);

  await writeAuthEvent({
    eventType,
    email: body.email,
    profileId: body.profileId,
    provider: body.provider ?? "email",
    ip: clientIpFromHeaders(request.headers),
    userAgent: request.headers.get("user-agent"),
    acceptLanguage: request.headers.get("accept-language"),
    referrer: acquisition.referrer,
    landingUrl: acquisition.landingUrl,
    landingPath: acquisition.landingPath,
    utmSource: acquisition.utmSource,
    utmMedium: acquisition.utmMedium,
    utmCampaign: acquisition.utmCampaign,
    utmTerm: acquisition.utmTerm,
    utmContent: acquisition.utmContent,
    gclid: acquisition.gclid,
    fbclid: acquisition.fbclid,
    timezone: acquisition.timezone,
    locale: acquisition.locale,
    screenWidth: acquisition.screenWidth ?? null,
    screenHeight: acquisition.screenHeight ?? null,
    geoCountry: geo.country,
    geoRegion: geo.region,
    geoCity: geo.city,
    metadata: body.metadata ?? {},
  });

  return NextResponse.json({ ok: true });
}
