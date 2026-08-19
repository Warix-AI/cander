"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CourierMark } from "@/components/brand/CourierMark";
import { useApp } from "@/components/app/AppProvider";
import { Modal } from "@/components/ui/Modal";
import { accountPresets, members } from "@/lib/data";
import {
  getAuthServerSnapshot,
  getAuthSnapshot,
  persistSignedIn,
  subscribeAuth,
} from "@/lib/session";
import type { AccountPresetId } from "@/lib/types";
import { cn } from "@/lib/utils";

const demoEmail = "matthew@acme.com";
const demoPassword = "courier";

export function SignInWall() {
  const signedIn = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthServerSnapshot,
  );

  if (signedIn) return null;

  return <SignInDialog />;
}

function SignInDialog() {
  const { setPreview } = useApp();
  const [email, setEmail] = useState(demoEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const signIn = (presetId?: AccountPresetId) => {
    if (presetId) {
      setPreview(presetId);
      persistSignedIn();
      return;
    }
    const match = members.find(
      (member) => member.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!match && email.trim().toLowerCase() !== demoEmail) {
      setError("Use a demo account below or matthew@acme.com.");
      return;
    }
    if (password && password !== demoPassword) {
      setError(`Prototype password is "${demoPassword}".`);
      return;
    }
    const actorId = match?.id ?? "m1";
    const resolved =
      accountPresets.find((item) => item.actorId === actorId)?.id ?? "max-owner";
    setPreview(resolved);
    persistSignedIn();
  };

  return (
    <Modal
      open
      onClose={() => {}}
      lockScroll={false}
      labelledBy="sign-in-title"
      className="w-full max-w-[26rem]"
    >
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <CourierMark className="h-7 w-7" />
          <span className="text-[15px] font-semibold tracking-[-0.03em]">
            Courier
          </span>
        </div>
        <h2
          id="sign-in-title"
          className="mt-5 text-[18px] font-medium tracking-[-0.02em]"
        >
          Sign in to Courier
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          This prototype uses demo accounts. Pick a role or use the credentials
          below.
        </p>

        <div className="mt-5 space-y-3">
          <Field label="Email">
            <input
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
              className="h-10 w-full rounded-[10px] border border-border bg-card px-3 text-[13.5px] outline-none focus:border-foreground/20"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              placeholder={demoPassword}
              className="h-10 w-full rounded-[10px] border border-border bg-card px-3 text-[13.5px] outline-none focus:border-foreground/20"
            />
          </Field>
          {error ? (
            <p className="text-[12.5px] text-destructive">{error}</p>
          ) : null}
          <button
            type="button"
            onClick={() => signIn()}
            className="inline-flex h-10 w-full items-center justify-center rounded-full bg-primary text-[13.5px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground"
          >
            Sign in
          </button>
        </div>

        <div className="mt-5 rounded-[10px] border border-border bg-muted/40 p-3">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            Demo login
          </p>
          <p className="mt-2 font-mono text-[12.5px] leading-relaxed">
            {demoEmail}
            <br />
            {demoPassword}
          </p>
        </div>

        <div className="mt-4">
          <p className="text-[12px] font-medium text-muted-foreground">
            Quick sign-in
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {accountPresets.slice(0, 5).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => signIn(preset.id)}
                className="rounded-full border border-border px-2.5 py-1 text-[11.5px] font-medium hover:bg-muted"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border px-5 py-4">
        <Link
          href="/home"
          className={cn(
            "flex h-10 w-full items-center justify-center rounded-full border border-foreground/15 text-[13.5px] font-medium tracking-[-0.01em] hover:bg-muted",
          )}
        >
          Go Home
        </Link>
      </div>
    </Modal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
