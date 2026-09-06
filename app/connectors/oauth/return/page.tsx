"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CanderMark } from "@/components/brand/CanderMark";
import { appConnectorById } from "@/lib/connectors/apps/definitions";
import { isOauthConnectorId } from "@/lib/connectors/oauth-connectors";
import {
  oauthReturnPath,
  publishOAuthHandoff,
} from "@/lib/connectors/oauth-handoff";
import { closeOAuthBrowser, isMobileShell } from "@/lib/mobile-shell";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

const GOOGLE_LABELS: Record<string, string> = {
  gmail: "Gmail",
  gcal: "Google Calendar",
  gdrive: "Google Drive",
  gsheets: "Google Sheets",
  gdocs: "Google Docs",
};

function connectorLabel(id: string | null): string {
  if (!id) return "this app";
  return appConnectorById(id)?.name ?? GOOGLE_LABELS[id] ?? id;
}

function accountHref(connector: string | null, result: "success" | "error"): string {
  const params = new URLSearchParams();
  if (connector && isOauthConnectorId(connector)) {
    params.set("connectors", connector);
  } else {
    params.set("connectors", "1");
  }
  params.set("result", result);
  return `/?${params.toString()}`;
}

async function completeVerifyWithSession(sessionUri: string): Promise<boolean> {
  try {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return false;
    const url = new URL("/api/connectors/oauth/verify", window.location.origin);
    url.searchParams.set("session_uri", sessionUri);
    url.searchParams.set("next", "/");
    const res = await fetch(url.toString(), {
      method: "GET",
      redirect: "manual",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      credentials: "include",
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("Location") || "";
      return location.includes("result=success") || res.type === "opaqueredirect";
    }
    return res.ok;
  } catch {
    return false;
  }
}

function isIosOrAndroidUa() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export default function ConnectorOAuthReturnPage() {
  const [phase, setPhase] = useState<
    "loading" | "denied" | "failed" | "success" | "open_app"
  >("loading");
  const [connector, setConnector] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [sessionUri, setSessionUri] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextSessionUri = params.get("session_uri")?.trim() || null;
    const connectorId = params.get("connector")?.trim() || null;
    setConnector(connectorId);
    setSessionUri(nextSessionUri);

    void (async () => {
      if (nextSessionUri) {
        const ok = await completeVerifyWithSession(nextSessionUri);
        if (ok) {
          await closeOAuthBrowser();
          setPhase("success");
          window.setTimeout(() => {
            window.location.replace(accountHref(connectorId, "success"));
          }, 600);
          return;
        }

        if (isMobileShell()) {
          const next = new URL("/api/connectors/oauth/verify", window.location.origin);
          next.searchParams.set("session_uri", nextSessionUri);
          next.searchParams.set("next", "/");
          window.location.replace(next.toString());
          return;
        }

        // External browser (Safari/Chrome) without Cander session — hand off
        // to the opener / other Cander tab, and show a web continue link.
        publishOAuthHandoff({
          sessionUri: nextSessionUri,
          connectorId,
        });
        setPhase("open_app");
        return;
      }

      const status = (params.get("status") || "").toLowerCase();
      const error =
        params.get("error")?.trim() ||
        params.get("error_code")?.trim() ||
        params.get("status_reason")?.trim() ||
        null;
      setErrorCode(error);

      const denied =
        error === "access_denied" ||
        /access[_\s-]?denied/i.test(error || "") ||
        status === "failed";

      await closeOAuthBrowser();
      setPhase(denied ? "denied" : "failed");
    })();
  }, []);

  const label = useMemo(() => connectorLabel(connector), [connector]);
  const backHref = useMemo(() => accountHref(connector, "error"), [connector]);
  const webContinueHref = useMemo(() => {
    if (!sessionUri) return "/";
    return oauthReturnPath({ sessionUri, connectorId: connector });
  }, [sessionUri, connector]);
  const nativeDeepLink = useMemo(() => {
    if (!sessionUri) return null;
    const url = new URL("cander://oauth/return");
    url.searchParams.set("session_uri", sessionUri);
    if (connector) url.searchParams.set("connector", connector);
    return url.toString();
  }, [sessionUri, connector]);

  if (phase === "loading" || phase === "success") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div
          className={cn(
            "w-full max-w-md border border-border bg-card p-8 text-center",
            SHELL_G3_RADIUS,
          )}
        >
          <CanderMark className="mx-auto h-8 w-8" />
          <p className="mt-6 text-[14px] text-muted-foreground">
            {phase === "success"
              ? "Connected. Returning to Cander…"
              : "Finishing connection…"}
          </p>
        </div>
      </main>
    );
  }

  if (phase === "open_app") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div
          className={cn(
            "w-full max-w-md border border-border bg-card p-8 text-center",
            SHELL_G3_RADIUS,
          )}
        >
          <CanderMark className="mx-auto h-8 w-8" />
          <h1 className="mt-6 text-[17px] font-medium tracking-[-0.02em]">
            Authorization succeeded
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Finish connecting {label} in your Cander window (desktop or browser
            tab where you&apos;re signed in). This Safari page can&apos;t
            complete it alone.
          </p>
          <a
            href={webContinueHref}
            className="mt-8 inline-flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
          >
            Continue in Cander
          </a>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Prefer this if you&apos;re signed in here. For the desktop app,
            use Open in Cander app below (requires the latest desktop build).
          </p>
          {nativeDeepLink ? (
            <a
              href={nativeDeepLink}
              className="mt-4 inline-flex text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline"
            >
              {isIosOrAndroidUa()
                ? "Open in Cander app"
                : "Open in Cander desktop"}
            </a>
          ) : null}
          <button
            type="button"
            className="mt-6 block w-full text-[12.5px] text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (!sessionUri) return;
              const absolute = new URL(
                webContinueHref,
                window.location.origin,
              ).toString();
              void navigator.clipboard.writeText(absolute).catch(() => undefined);
            }}
          >
            Copy finish link
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div
        className={cn(
          "w-full max-w-md border border-border bg-card p-8 text-center",
          SHELL_G3_RADIUS,
        )}
      >
        <CanderMark className="mx-auto h-8 w-8" />
        <h1 className="mt-6 text-[17px] font-medium tracking-[-0.02em]">
          {phase === "denied"
            ? `Failed to connect Cander to ${label}`
            : `Could not connect ${label}`}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {phase === "denied"
            ? `We couldn't connect your ${label} account to Cander. Please try again.`
            : `Something went wrong while connecting ${label}. You can return to your account and try again.`}
        </p>
        {errorCode ? (
          <p className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[12px] text-muted-foreground">
            {errorCode}
          </p>
        ) : null}
        <Link
          href={backHref}
          className="mt-8 inline-flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
        >
          Back to account
        </Link>
      </div>
    </main>
  );
}
