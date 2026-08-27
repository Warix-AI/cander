"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CourierMark } from "@/components/brand/CourierMark";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { updatePassword } from "@/lib/supabase/auth-actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Password recovery destination after the email link hits /auth/callback?next=/auth/reset.
 */
export default function AuthResetPage() {
  const router = useRouter();
  const supabase = isSupabaseConfigured();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(!supabase);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const client = createSupabaseBrowserClient();
    void client.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setError("Open the reset link from your email, then try again.");
        setReady(false);
        return;
      }
      setReady(true);
    });
  }, [supabase]);

  const submit = async () => {
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      setDone(true);
      window.setTimeout(() => router.replace("/"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-[24rem]">
        <Link href="/" className="inline-flex items-center gap-2">
          <CourierMark className="h-7 w-7" />
          <span className="text-[15px] font-medium tracking-[-0.02em]">Cander</span>
        </Link>
        <h1 className="mt-8 text-[1.75rem] font-medium tracking-[-0.03em]">
          Set a new password
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          Choose a password for your Cander account, then continue into the app.
        </p>

        {done ? (
          <p className="mt-8 text-[14px] text-foreground">Password updated. Opening Cander…</p>
        ) : (
          <form
            className="mt-8 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="block space-y-1.5">
              <span className="text-[12.5px] font-medium text-muted-foreground">
                New password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={!ready || busy}
                className="h-11 w-full rounded-[10px] border border-border bg-background px-3 text-[14px] outline-none focus:border-foreground/25"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[12.5px] font-medium text-muted-foreground">
                Confirm password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                disabled={!ready || busy}
                className="h-11 w-full rounded-[10px] border border-border bg-background px-3 text-[14px] outline-none focus:border-foreground/25"
              />
            </label>
            {error ? (
              <p className="text-[12.5px] text-destructive">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={!ready || busy}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[14px] font-medium text-primary-foreground hover:bg-foreground disabled:opacity-50"
            >
              {busy ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
