/**
 * Server-side auth event writer (service role).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AuthEventType } from "@/lib/auth/acquisition";
import {
  cleanHeader,
  clientIpFromHeaders,
  geoFromHeaders,
  parseIp,
} from "@/lib/auth/request-geo";

export { clientIpFromHeaders, geoFromHeaders, parseIp };

export type AuthEventRecord = {
  eventType: AuthEventType;
  profileId?: string | null;
  email?: string | null;
  provider?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  acceptLanguage?: string | null;
  referrer?: string | null;
  landingUrl?: string | null;
  landingPath?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  timezone?: string | null;
  locale?: string | null;
  screenWidth?: number | null;
  screenHeight?: number | null;
  geoCountry?: string | null;
  geoRegion?: string | null;
  geoCity?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAuthEvent(input: AuthEventRecord): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("auth_events").insert({
      event_type: input.eventType,
      profile_id: input.profileId ?? null,
      email: cleanHeader(input.email, 320)?.toLowerCase() ?? null,
      provider: cleanHeader(input.provider, 40),
      ip: parseIp(input.ip),
      user_agent: cleanHeader(input.userAgent, 1000),
      accept_language: cleanHeader(input.acceptLanguage, 200),
      referrer: cleanHeader(input.referrer, 2000),
      landing_url: cleanHeader(input.landingUrl, 2000),
      landing_path: cleanHeader(input.landingPath, 500),
      utm_source: cleanHeader(input.utmSource, 200),
      utm_medium: cleanHeader(input.utmMedium, 200),
      utm_campaign: cleanHeader(input.utmCampaign, 200),
      utm_term: cleanHeader(input.utmTerm, 200),
      utm_content: cleanHeader(input.utmContent, 200),
      gclid: cleanHeader(input.gclid, 200),
      fbclid: cleanHeader(input.fbclid, 200),
      timezone: cleanHeader(input.timezone, 80),
      locale: cleanHeader(input.locale, 40),
      screen_width: input.screenWidth ?? null,
      screen_height: input.screenHeight ?? null,
      geo_country: cleanHeader(input.geoCountry, 8),
      geo_region: cleanHeader(input.geoRegion, 80),
      geo_city: cleanHeader(input.geoCity, 80),
      metadata: input.metadata ?? {},
    });
    if (error) {
      console.error("[auth-events] insert failed", error.message);
    }
  } catch (err) {
    console.error("[auth-events] failed to write", err);
  }
}
