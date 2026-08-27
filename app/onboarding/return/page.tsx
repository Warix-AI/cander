"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CourierMark } from "@/components/brand/CourierMark";
import { InviteAcceptFlow } from "@/components/onboarding/InviteAcceptFlow";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

export default function OnboardingReturnPage() {
  const router = useRouter();
  const [state, setState] = useState<
    "loading" | "ready" | "error" | "bypass"
  >("loading");
  const [plan, setPlan] = useState<"pro" | "max" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) {
      setState("error");
      setMessage("Missing checkout session.");
      return;
    }

    void (async () => {
      try {
        const response = await fetch(
          `/api/stripe/checkout?session_id=${encodeURIComponent(sessionId)}`,
        );
        const data = await response.json();
        if (data.bypass) {
          setState("bypass");
          router.replace("/?onboarding=resume");
          return;
        }
        if (!response.ok || !data.paid) {
          setState("error");
          setMessage(data.error ?? "Payment was not completed.");
          return;
        }
        setPlan(data.plan ?? null);
        setState("ready");
        router.replace("/?onboarding=resume&paid=1");
      } catch {
        setState("error");
        setMessage("Could not confirm payment.");
      }
    })();
  }, [router]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div
        className={cn(
          "w-full max-w-md border border-border bg-card p-8 text-center",
          SHELL_G3_RADIUS,
        )}
      >
        <CourierMark className="mx-auto h-8 w-8" />
        {state === "loading" || state === "bypass" ? (
          <p className="mt-6 text-[14px] text-muted-foreground">
            Confirming payment…
          </p>
        ) : null}
        {state === "ready" ? (
          <>
            <p className="mt-6 text-[15px] font-medium tracking-[-0.02em]">
              Payment confirmed
            </p>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {plan === "max"
                ? "Continuing Max setup…"
                : "Continuing Pro setup…"}
            </p>
          </>
        ) : null}
        {state === "error" ? (
          <>
            <p className="mt-6 text-[15px] font-medium tracking-[-0.02em]">
              Checkout incomplete
            </p>
            <p className="mt-2 text-[13px] text-destructive">{message}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
