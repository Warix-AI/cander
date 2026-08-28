"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CanderMark } from "@/components/brand/CanderMark";
import { VerifyCodeInput } from "@/components/onboarding/VerifyCodeInput";
import {
  resendSignupEmail,
  signInWithPassword,
  signUpWithPassword,
  verifySignupOtp,
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
  const [mode, setMode] = useState<"signup" | "signin" | "verify">("signup");
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
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
    if (mode === "verify") {
      const code = verifyCode.replace(/\s/g, "");
      if (code.length < 6) {
        setError("Enter the 6-digit code from your email.");
        return;
      }
      setBusy(true);
      setError("");
      try {
        await verifySignupOtp(preview.email, code);
        await finishAccept();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "That code didn’t work. Try again or resend.",
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (mode === "signup") {
        const result = await signUpWithPassword({
          email: preview.email,
          password,
          name: fullName || preview.email,
        });
        const maybeExisting =
          result.user &&
          Array.isArray(result.user.identities) &&
          result.user.identities.length === 0;
        if (maybeExisting) {
          try {
            await signInWithPassword({ email: preview.email, password });
            await finishAccept();
            return;
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Could not sign in.";
            if (/confirm|not confirmed|verif/i.test(message)) {
              setMode("verify");
              setInfo("Confirm your email with the code we sent, then continue.");
              return;
            }
            setMode("signin");
            setError("Account exists — sign in with your password to join.");
            return;
          }
        }
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          setMode("verify");
          setInfo(`We sent a code to ${preview.email}. Enter it to join.`);
          return;
        }
      } else {
        await signInWithPassword({ email: preview.email, password });
      }
      await finishAccept();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not continue.";
      if (/confirm|not confirmed|verif/i.test(message)) {
        setMode("verify");
        setInfo("Confirm your email with the code we sent, then continue.");
      } else if (/already|registered|exists/i.test(message)) {
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
      <CanderMark className="h-7 w-7" />
      <h1 className="heading-display mt-8 text-[1.85rem] tracking-[-0.03em]">
        Join {preview.orgName}
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        {mode === "verify"
          ? "Enter the verification code from your email to finish joining."
          : `Your ${planLabel(preview.plan)} seat is ready. Confirm your details and set a password to enter Cander.`}
      </p>

      <div className="mt-8 space-y-3">
        {mode !== "verify" ? (
          <>
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
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className={inputClass}
            />
          </>
        ) : (
          <VerifyCodeInput
            value={verifyCode}
            disabled={busy}
            autoFocus
            onChange={setVerifyCode}
            onComplete={() => void submit()}
          />
        )}
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
        {info ? (
          <p className="text-[12.5px] text-muted-foreground">{info}</p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className={cn(
            "inline-flex h-11 w-full items-center justify-center bg-primary text-[14px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground disabled:opacity-50",
            SHELL_G3_RADIUS,
          )}
        >
          {busy
            ? "Working…"
            : mode === "verify"
              ? "Verify and join"
              : mode === "signin"
                ? "Sign in and join"
                : "Create account and join"}
        </button>
        {mode === "verify" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void resendSignupEmail(preview.email)
                .then(() => setInfo(`Code resent to ${preview.email}.`))
                .catch((err) =>
                  setError(
                    err instanceof Error ? err.message : "Could not resend code.",
                  ),
                );
            }}
            className="inline-flex h-10 w-full items-center justify-center text-[13px] text-muted-foreground hover:text-foreground"
          >
            Resend code
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setError("");
              setInfo("");
            }}
            className="inline-flex h-10 w-full items-center justify-center text-[13px] text-muted-foreground hover:text-foreground"
          >
            {mode === "signup"
              ? "Already have an account? Sign in"
              : "Need an account? Create one"}
          </button>
        )}
      </div>
    </>
  );
}
