"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/client";
import {
  getSupabaseUserSnapshot,
  subscribeSupabaseUser,
} from "@/lib/supabase/auth-store";

let cachedAdmin: boolean | null = null;
let inflight: Promise<boolean> | null = null;

async function probePlatformAdmin(): Promise<boolean> {
  if (cachedAdmin != null) return cachedAdmin;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await adminFetch("/api/admin/me");
      cachedAdmin = res.ok;
    } catch {
      cachedAdmin = false;
    } finally {
      inflight = null;
    }
    return cachedAdmin ?? false;
  })();
  return inflight;
}

/** Clear cache on sign-out / user change so a different account re-probes. */
export function clearPlatformAdminCache() {
  cachedAdmin = null;
  inflight = null;
}

/**
 * Whether the signed-in user can open `/admin`.
 * `null` while probing; `false` when signed out or denied.
 */
export function useIsPlatformAdmin(): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(cachedAdmin);
  const [userId, setUserId] = useState<string | null>(
    () => getSupabaseUserSnapshot()?.id ?? null,
  );

  useEffect(() => {
    return subscribeSupabaseUser(() => {
      const next = getSupabaseUserSnapshot()?.id ?? null;
      setUserId((prev) => {
        if (prev !== next) clearPlatformAdminCache();
        return next;
      });
    });
  }, []);

  useEffect(() => {
    if (!userId) {
      clearPlatformAdminCache();
      setAllowed(false);
      return;
    }
    let cancelled = false;
    void probePlatformAdmin().then((ok) => {
      if (!cancelled) setAllowed(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return allowed;
}
