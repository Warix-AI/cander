"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { adminJson } from "@/lib/admin/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";
import {
  getSessionReadyServerSnapshot,
  getSessionReadySnapshot,
  subscribeSessionReady,
} from "@/lib/session-ready";
import {
  getSupabaseUserSnapshot,
  subscribeSupabaseUser,
  validateSupabaseSession,
} from "@/lib/supabase/auth-store";

type GateState =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "denied"; reason: string };

async function waitForAccessToken(timeoutMs = 4000): Promise<{
  token: string | null;
  email: string | null;
  userId: string | null;
}> {
  const started = Date.now();
  const supabase = createSupabaseBrowserClient();

  while (Date.now() - started < timeoutMs) {
    const fromStore = getSupabaseUserSnapshot();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token ?? null;
    if (token) {
      return {
        token,
        email: session?.user?.email ?? fromStore?.email ?? null,
        userId: session?.user?.id ?? fromStore?.id ?? null,
      };
    }

    const user = fromStore ?? (await validateSupabaseSession());
    if (user) {
      const again = await supabase.auth.getSession();
      const t = again.data.session?.access_token ?? null;
      if (t) {
        return {
          token: t,
          email: user.email ?? null,
          userId: user.id,
        };
      }
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  const fallback = getSupabaseUserSnapshot();
  return {
    token: null,
    email: fallback?.email ?? null,
    userId: fallback?.id ?? null,
  };
}

/**
 * Client gate for /admin — waits for a real browser access token, then probes
 * `/api/admin/me`. Shows the denial reason instead of a silent bounce.
 */
export function AdminAccessGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const sessionReady = useSyncExternalStore(
    subscribeSessionReady,
    getSessionReadySnapshot,
    getSessionReadyServerSnapshot,
  );
  // Keep subscription so store updates can unblock the wait loop.
  useSyncExternalStore(subscribeSupabaseUser, getSupabaseUserSnapshot, () => null);

  const [state, setState] = useState<GateState>({ kind: "loading" });

  useEffect(() => {
    if (!sessionReady) return;
    let cancelled = false;

    async function check() {
      try {
        if (!isSupabaseConfigured()) {
          if (!cancelled) {
            setState({
              kind: "denied",
              reason: "Supabase is not configured in this environment.",
            });
          }
          return;
        }

        const { token, email, userId } = await waitForAccessToken();
        if (!token) {
          if (!cancelled) {
            setState({
              kind: "denied",
              reason:
                "Not signed in. Sign in on the main app as matt@warix.co, then open /admin again.",
            });
          }
          return;
        }

        const res = await fetch("/api/admin/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) {
            setState({
              kind: "denied",
              reason:
                res.status === 403
                  ? `Signed in as ${email ?? userId ?? "this account"}, but platform admin is not enabled for it.`
                  : typeof body?.error === "string"
                    ? body.error
                    : `Admin check failed (${res.status}).`,
            });
          }
          return;
        }

        if (!cancelled) setState({ kind: "ok" });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "denied",
            reason:
              err instanceof Error
                ? err.message
                : "Platform admin check failed.",
          });
        }
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [sessionReady]);

  useEffect(() => {
    if (state.kind !== "denied") return;
    const id = window.setTimeout(() => {
      router.replace("/");
    }, 3500);
    return () => window.clearTimeout(id);
  }, [state, router]);

  if (state.kind === "loading" || !sessionReady) {
    return (
      <div className="flex h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        Checking platform admin access…
      </div>
    );
  }

  if (state.kind === "denied") {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <p className="text-sm font-medium text-foreground">Admin access denied</p>
        <p className="max-w-md text-sm text-muted-foreground">{state.reason}</p>
        <p className="text-[11px] text-muted-foreground">
          Redirecting to the app…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
