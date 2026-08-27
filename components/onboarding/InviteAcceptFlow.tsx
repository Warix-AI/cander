"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CourierMark } from "@/components/brand/CourierMark";
import {
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/supabase/auth-actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { planLabel } from "@/lib/billing";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

type InvitePreview = {
  orgName: string;
  email: string;
  firstName: string;
  lastName: string;
  plan: "pro" | "max";
};

export function InviteAcceptFlow({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch(`/api/org/invites/${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Invite not found.");
        return response.json() as Promise<InvitePreview>;
      })
      .then(setPreview)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Invite not found.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const fullName = preview
    ? [preview.firstName, preview.lastName].filter(Boolean).join(" ")
    : "";

  const finishAccept = async () => {
    if (!isSupabaseConfigured() || !preview) return;
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error("No session after sign-in.");

    const response = await fetch(
      `/api/org/invites/${encodeURIComponent(token)}/accept`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Could not accept invite.");
    }
    router.replace("/");
  };

  const submit = async () => {
    if (!preview) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        await signUpWithPassword({
          email: preview.email,
          password,
          name: fullName || preview.email,
        });
      } else {
        await signInWithPassword({ email: preview.email, password });
      }
      await finishAccept();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not continue.";
      if (/already|registered|exists/i.test(message)) {
        setMode("signin");
        setError("Account exists — sign in with your password to join.");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <p className="text-[14px] text-muted-foreground">Loading invite…</p>
    );
  }

  if (!preview) {
    return (
      <p className="text-[14px] text-destructive">
        {error || "This invite is invalid or expired."}
      </p>
    );
  }

  const inputClass = cn(
    "h-11 w-full border border-border bg-background px-3.5 text-[14px] outline-none focus:border-foreground/20",
    SHELL_G3_RADIUS,
  );

  return (
    <>
      <CourierMark className="h-7 w-7" />
      <h1 className="heading-display mt-8 text-[1.85rem] tracking-[-0.03em]">
        Join {preview.orgName}
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Your {planLabel(preview.plan)} seat is ready. Confirm your details and
        set a password to enter Cander.
      </p>

      <div className="mt-8 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input
            value={preview.firstName}
            readOnly
            aria-label="First name"
            className={cn(inputClass, "bg-muted/40 text-muted-foreground")}
          />
          <input
            value={preview.lastName}
            readOnly
            aria-label="Last name"
            className={cn(inputClass, "bg-muted/40 text-muted-foreground")}
          />
        </div>
        <input
          value={preview.email}
          readOnly
          aria-label="Email"
          className={cn(inputClass, "bg-muted/40 text-muted-foreground")}
        />
        <div
          className={cn(
            "flex items-center justify-between border border-border px-3.5 py-2.5",
            SHELL_G3_RADIUS,
          )}
        >
          <span className="text-[12.5px] text-muted-foreground">Plan</span>
          <span className="text-[13.5px] font-medium">{planLabel(preview.plan)}</span>
        </div>
        <input
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError("");
          }}
          placeholder="Create a password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className={inputClass}
        />
      </div>

      {error ? (
        <p className="mt-4 text-[12.5px] text-destructive">{error}</p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className={cn(
          "mt-6 inline-flex h-11 w-full items-center justify-center bg-primary text-[14px] font-medium text-primary-foreground hover:bg-foreground disabled:opacity-50",
          SHELL_G3_RADIUS,
        )}
      >
        {busy
          ? "Joining…"
          : mode === "signup"
            ? "Confirm & join"
            : "Sign in & join"}
      </button>

      <p className="mt-4 text-center text-[12px] leading-relaxed text-muted-foreground">
        Billing for your seat is managed by {preview.orgName}. You can sign out
        anytime; account deletion is handled by your admin.
      </p>
    </>
  );
}
