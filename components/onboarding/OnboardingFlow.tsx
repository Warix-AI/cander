"use client";

import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { CanderMark } from "@/components/brand/CanderMark";
import { useApp } from "@/components/app/AppProvider";
import {
  getAuthServerSnapshot,
  getAuthSnapshot,
  getOnboardingPendingServerSnapshot,
  getOnboardingPendingSnapshot,
  persistOnboardingPending,
  persistSignedIn,
  persistWorkspace,
  persistActor,
  subscribeAuth,
  subscribeOnboardingPending,
} from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/data-backend";
import {
  resendSignupEmail,
  signInWithPassword,
  signUpWithPassword,
  requestPasswordReset,
  verifySignupOtp,
} from "@/lib/supabase/auth-actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  applySignupPlanAndSpaces,
  hydrateMemberFromSupabase,
} from "@/lib/supabase/hydrate-member";
import { tryEnterExistingAccount } from "@/lib/onboarding-recovery";
import { clearLocalAuthState } from "@/lib/auth/sign-out";
import {
  captureAcquisitionContext,
  reportAuthEvent,
} from "@/lib/auth/acquisition";
import {
  clearPendingSignupEmail,
  isAuthEmailConfirmed,
  persistPendingSignupEmail,
  readPendingSignupEmail,
} from "@/lib/auth/email-confirmed";
import { syncSupabaseAuthUser } from "@/lib/supabase/auth-store";
import { OnboardingAppsStep } from "@/components/onboarding/OnboardingAppsStep";
import { OAuthButtons } from "@/components/onboarding/OAuthButtons";
import {
  composerHintForConnectedApps,
  setOnboardingComposerHint,
} from "@/lib/onboarding/composer-hint";
import {
  getConnectorConnectionsSnapshot,
} from "@/lib/connector-connections-store";
import { isUiConnectedStatus } from "@/lib/connectors/authz";
import { VerifyCodeInput, SIGNUP_OTP_LENGTH } from "@/components/onboarding/VerifyCodeInput";
import {
  LIMITLESS_CONTACT_HREF,
  PLAN_CATALOG,
  SELF_SERVE_PLANS,
  formatPlanPrice,
  formatPlanUsageLevel,
  isSelfServePlan,
} from "@/lib/billing/plan-catalog";
import { resolveOnboardingFinishPlan } from "@/lib/billing/resolve-onboarding-plan";
import { normalizePlan } from "@/lib/plans";

function digitsOnly(raw: string, length = SIGNUP_OTP_LENGTH) {
  return raw.replace(/\D/g, "").slice(0, length);
}
import { AppearanceScope } from "@/components/theme/AppearanceProvider";
import { setColorMode } from "@/lib/appearance";
import type { AccountPresetId, BillingPlan } from "@/lib/types";
import { createWorkspace } from "@/lib/workspace-catalog";
import {
  clearOnboardingCheckpoint,
  getOnboardingCheckpointSnapshot,
  normalizeOnboardingStep,
  persistOnboardingCheckpoint,
  resumeStepForPlan,
  type OnboardingCheckpoint,
} from "@/lib/onboarding-checkpoint";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { completeEmailVerificationFromUrl } from "@/lib/auth/email-verify-landing";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const supabaseMode = () => isSupabaseConfigured();

function presetForPlan(plan: BillingPlan): AccountPresetId {
  if (plan === "minimal") return "free";
  if (plan === "light") return "pro";
  return "max-owner";
}

type Step =
  | "welcome"
  | "sign-in"
  | "forgot"
  | "create"
  | "verify"
  | "plan"
  | "apps";

function createStepsFor(): Step[] {
  return ["create", "plan", "apps"];
}

/** After email verify: always continue to plan selection. */
function stepAfterEmailVerified(): Step {
  return "plan";
}

const DEFAULT_PERSONAL_WORKSPACE_NAME = "Personal";

async function bootstrapPersonalWorkspace(accessToken: string): Promise<string> {
  const response = await fetch("/api/onboarding/bootstrap", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Could not prepare workspace.",
    );
  }
  return data.workspaceId as string;
}

function workspaceIdFromUserId(userId: string) {
  return `ws-${userId.replace(/-/g, "")}`;
}

function resolveInitialOnboardingStep(initialSignedIn: boolean): Step {
  if (typeof window !== "undefined") {
    const auth = new URLSearchParams(window.location.search).get("auth");
    // Link callback — start on verify; layout effect advances only after Auth confirms.
    if (auth === "verified") return "verify";
  }
  // Mid-signup refresh must NOT skip email verify. Pending alone is not enough.
  if (initialSignedIn || getOnboardingPendingSnapshot() || readPendingSignupEmail()) {
    return "verify";
  }
  return "welcome";
}

const PLAN_PANEL_BULLETS: Record<BillingPlan, string[]> = {
  minimal: [
    "Free · 25 AI minutes/month",
    "Unlimited Apps · 1 account per App",
  ],
  light: [
    "$30/month · 100 AI minutes",
    "Multiple accounts per App",
  ],
  moderate: [
    "$75/month · 250 AI minutes",
    "Multiple accounts per App",
  ],
  heavy: [
    "$150/month · 500 AI minutes",
    "Multiple accounts per App",
  ],
  limitless: [
    "Custom pricing & AI usage",
    "Contact us to get started",
  ],
};

const PANEL_COPY: Record<
  Step,
  { title: string; body: string }
> = {
  welcome: {
    title: "Operate, build, and explore together.",
    body: "Connect apps, run automations, and keep every workspace in sync.",
  },
  "sign-in": {
    title: "Pick up where you left off.",
    body: "Sign in with the email and password for your Cander account.",
  },
  forgot: {
    title: "Reset your password.",
    body: "We’ll email a link to set a new password, then bring you back into Cander.",
  },
  create: {
    title: "Create an account, then finish setup.",
    body: "We’ll walk through plan and apps — then open Cander.",
  },
  verify: {
    title: "Confirm it’s you.",
    body: "Enter the code we emailed to finish confirming your account.",
  },
  plan: {
    title: "Choose a plan.",
    body: "Plans differ by AI minutes and how many accounts you can connect per App.",
  },
  apps: {
    title: "Connect your Apps.",
    body: "Link the tools you use — you can always add more later.",
  },
};

/** One-line copy for the mobile gradient card (7–8 words). */
const MOBILE_PANEL_LINE: Record<Step, string> = {
  welcome: "Operate, build, and explore together.",
  "sign-in": "Pick up where you left off.",
  forgot: "Reset your password with an email link.",
  create: "Create an account, then finish setup.",
  verify: "Enter the code we sent to your email.",
  plan: "Pick a plan that matches your usage.",
  apps: "Connect the Apps you use most.",
};

/**
 * Full-screen auth + onboarding when no session is present.
 * Desktop: 50/50 form left, full-bleed preview right.
 */
export function OnboardingFlow() {
  const signedIn = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthServerSnapshot,
  );
  const onboardingPending = useSyncExternalStore(
    subscribeOnboardingPending,
    getOnboardingPendingSnapshot,
    getOnboardingPendingServerSnapshot,
  );
  // Stay mounted through email verify + remaining setup after session exists.
  if (signedIn && !onboardingPending) return null;
  return <OnboardingShell initialSignedIn={signedIn && onboardingPending} />;
}

function OnboardingShell({
  initialSignedIn = false,
}: {
  initialSignedIn?: boolean;
}) {
  const { setPreview, setWorkspace } = useApp();
  const mobile = useMobileShell();
  const usingSupabase = supabaseMode();
  const [step, setStep] = useState<Step>(() =>
    resolveInitialOnboardingStep(initialSignedIn),
  );
  const [email, setEmail] = useState(() => readPendingSignupEmail());
  const [password, setPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  // Never assume verify is done from a refresh — prove it via OTP / confirmed session.
  const [passedVerify, setPassedVerify] = useState(false);

  // Onboarding always opens in light — ignore prior session / system dark.
  useLayoutEffect(() => {
    setColorMode("light");
  }, []);

  // Email-verify link — sync session immediately so profile step is authenticated.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    void completeEmailVerificationFromUrl().then(async (result) => {
      if (result === "verified") {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || (usingSupabase && !isAuthEmailConfirmed(user))) {
          setPassedVerify(false);
          setStep("verify");
          setError("Confirm your email with the code we sent before continuing.");
          return;
        }
        const entered = await tryEnterExistingAccount().catch(() => false);
        if (entered) return;
        persistOnboardingPending(true);
        clearPendingSignupEmail();
        setPassedVerify(true);
        if (user.id) await syncPlanFromProfile(user.id);
        setStep(stepAfterEmailVerified());
        setError("");
        if (user.email) setEmail(user.email);
        const metaName = user.user_metadata?.name;
        if (typeof metaName === "string" && metaName.trim()) {
          setName(metaName.trim());
          setShortName((current) =>
            current.trim()
              ? current
              : metaName.trim().split(/\s+/)[0] || "You",
          );
        }
        return;
      }
      if (result === "error") {
        setError("Email link expired or invalid. Sign in or request a new code.");
        setStep("sign-in");
      }
    });
  }, [usingSupabase]);

  // Hard gate: never allow post-verify steps without a confirmed email.
  useEffect(() => {
    if (!usingSupabase) {
      setPassedVerify(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const pendingEmail = readPendingSignupEmail();
      if (pendingEmail && !email.trim()) setEmail(pendingEmail);

      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (user?.email) setEmail(user.email);
      const confirmed = isAuthEmailConfirmed(user);

      if (confirmed) {
        clearPendingSignupEmail();
        setPassedVerify(true);
        // Refresh after confirming elsewhere — leave the code screen.
        if (step === "verify") {
          const entered = await tryEnterExistingAccount().catch(() => false);
          if (cancelled || entered) return;
          if (user?.id) await syncPlanFromProfile(user.id);
          setStep(stepAfterEmailVerified());
        }
        return;
      }

      setPassedVerify(false);
      const postVerify: Step[] = ["plan", "apps"];
      // Only yank forward steps — allow create/sign-in so they can fix email.
      if (!postVerify.includes(step)) return;
      setStep("verify");
      if (!info) {
        setInfo(
          pendingEmail || email
            ? `Enter the code we sent to ${(pendingEmail || email).trim()} to continue.`
            : "Confirm your email with the code we sent before continuing.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-run when step advances past verify so a refresh mid-flow is pulled back.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gate on auth + step family
  }, [usingSupabase, initialSignedIn, step]);

  useEffect(() => {
    captureAcquisitionContext();
    reportAuthEvent({ eventType: "visit", metadata: { surface: "onboarding" } });
  }, []);

  useEffect(() => {
    if (!initialSignedIn || !isSupabaseConfigured()) return;
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      if (user.email) setEmail(user.email);
      const metaName = user.user_metadata?.name;
      if (typeof metaName === "string" && metaName.trim()) {
        setName(metaName.trim());
        setShortName((current) =>
          current.trim()
            ? current
            : metaName.trim().split(/\s+/)[0] || "You",
        );
      }
    });
  }, [initialSignedIn]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const hasConnectorsReturn =
      params.has("connectors") ||
      params.get("result") === "success" ||
      params.get("onboarding") === "apps";
    if (!hasConnectorsReturn || !getOnboardingPendingSnapshot()) return;

    setStep("apps");
    const local = getOnboardingCheckpointSnapshot();
    if (local?.plan) setPlan(local.plan);
    if (local?.workspaceId) {
      setWorkspaceId(local.workspaceId);
    } else if (isSupabaseConfigured()) {
      void createSupabaseBrowserClient()
        .auth.getUser()
        .then(({ data }) => {
          if (data.user?.id) setWorkspaceId(workspaceIdFromUserId(data.user.id));
        });
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("onboarding") !== "resume") return;

    const restore = (
      cp: OnboardingCheckpoint,
      emailConfirmed: boolean,
      userId?: string,
    ) => {
      if (cp.plan) setPlan(cp.plan);
      if (cp.shortName) setShortName(cp.shortName);
      if (cp.name) setName(cp.name);
      if (cp.email) setEmail(cp.email);
      const restoredWs =
        cp.workspaceId ||
        (userId ? workspaceIdFromUserId(userId) : "");
      if (restoredWs) setWorkspaceId(restoredWs);
      // Never resume past verify without a confirmed email.
      if (!emailConfirmed && usingSupabase) {
        setPassedVerify(false);
        setStep("verify");
        return;
      }
      const normalized = normalizeOnboardingStep(cp.step) as Step;
      if (normalized === "apps" || cp.plan) {
        setStep(cp.plan ? "apps" : normalized);
        if (!restoredWs && userId) setWorkspaceId(workspaceIdFromUserId(userId));
        return;
      }
      setStep(normalized === "welcome" ? resumeStepForPlan(cp.plan) as Step : normalized);
    };

    void (async () => {
      let emailConfirmed = !usingSupabase;
      let userId: string | undefined;
      if (isSupabaseConfigured()) {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        emailConfirmed = isAuthEmailConfirmed(user);
        userId = user?.id;
        if (user?.email) setEmail(user.email);

        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("onboarding_checkpoint, plan, subscription_status")
            .eq("id", user.id)
            .maybeSingle();
          const cp = profile?.onboarding_checkpoint as OnboardingCheckpoint | null;
          if (cp?.plan) {
            restore(cp, emailConfirmed, user.id);
            return;
          }
          if (profile?.plan && profile.plan !== "minimal" && profile.plan !== "free") {
            setPlan(profile.plan as BillingPlan);
            if (!emailConfirmed && usingSupabase) {
              setPassedVerify(false);
              setStep("verify");
            } else {
              setWorkspaceId(workspaceIdFromUserId(user.id));
              setStep(resumeStepForPlan(profile.plan as BillingPlan) as Step);
            }
            return;
          }
        }
      }

      const local = getOnboardingCheckpointSnapshot();
      if (local?.plan) restore(local, emailConfirmed, userId);
    })();

    window.history.replaceState({}, "", window.location.pathname);
  }, [usingSupabase]);

  const buildCheckpoint = (): OnboardingCheckpoint => ({
    step,
    plan: plan ?? "minimal",
    shortName,
    name,
    email,
    workspaceId: workspaceId || undefined,
  });

  const simulateSubscribeAndContinue = async (chosen: BillingPlan) => {
    if (!isSelfServePlan(chosen)) {
      window.location.href = LIMITLESS_CONTACT_HREF;
      return;
    }

    setBusy(true);
    setError("");
    setInfo("");
    setPlan(chosen);
    persistOnboardingCheckpoint({
      ...buildCheckpoint(),
      plan: chosen,
      step: "apps",
    });

    try {
      let nextWorkspaceId = workspaceId;

      if (isSupabaseConfigured()) {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error("Sign in to continue.");
        }
        const response = await fetch("/api/billing/subscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ plan: chosen }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "Could not save your plan.",
          );
        }
        if (typeof data.plan === "string") {
          setPlan(data.plan as BillingPlan);
        }

        nextWorkspaceId = await bootstrapPersonalWorkspace(session.access_token);
        setWorkspaceId(nextWorkspaceId);
        persistWorkspace(nextWorkspaceId);
      } else {
        const created = createWorkspace({
          name: DEFAULT_PERSONAL_WORKSPACE_NAME,
          kind: "personal",
        });
        nextWorkspaceId = created?.id ?? workspaceIdFromUserId("local");
        setWorkspaceId(nextWorkspaceId);
        if (created) {
          persistWorkspace(created.id);
          setWorkspace(created.id);
        }
      }

      persistOnboardingCheckpoint({
        ...buildCheckpoint(),
        plan: chosen,
        step: "apps",
        workspaceId: nextWorkspaceId,
      });
      setStep("apps");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your selection.",
      );
    } finally {
      setBusy(false);
    }
  };

  const createSteps = useMemo(() => createStepsFor(), []);

  const enterWithPlan = async (chosen: BillingPlan = "moderate") => {
    persistOnboardingPending(false);
    clearOnboardingCheckpoint();
    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        syncSupabaseAuthUser(user);
        reportAuthEvent({
          eventType: "onboarding_completed",
          email: user.email,
          profileId: user.id,
          metadata: { plan: chosen },
        });
        try {
          await hydrateMemberFromSupabase(user);
        } catch (hydrateErr) {
          console.warn("[cander] hydrate after finish failed", hydrateErr);
        }
        persistActor(user.id);
        return;
      }
    }
    setPreview(presetForPlan(chosen));
    if (!isSupabaseConfigured()) {
      persistSignedIn();
    }
  };

  const syncPlanFromProfile = async (userId: string) => {
    if (!isSupabaseConfigured()) return;
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.plan != null) {
        setPlan(normalizePlan(profile.plan));
      }
    } catch {
      // non-fatal — finish path re-reads profiles.plan
    }
  };

  const finishLocalAccount = async () => {
    let existingPlan: BillingPlan | null = null;
    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user: sessionUser },
      } = await supabase.auth.getUser();
      if (sessionUser) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan")
          .eq("id", sessionUser.id)
          .maybeSingle();
        if (profile?.plan != null) {
          existingPlan = normalizePlan(profile.plan);
        }
      }
    }

    const requestedPlan = plan ?? "minimal";
    const signupPlan = resolveOnboardingFinishPlan({
      existingPlan,
      requestedPlan,
    });
    const resolvedName = name.trim();
    const resolvedShort =
      shortName.trim() || resolvedName.split(/\s+/)[0] || "You";

    if (isSupabaseConfigured()) {
      // Drop sticky prototype catalog/pins before writing the real account.
      clearLocalAuthState();
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Signed up, but no session yet. Try Sign in.");
      }
      if (!isAuthEmailConfirmed(user)) {
        setPassedVerify(false);
        setStep("verify");
        throw new Error(
          "Confirm your email with the code we sent before finishing setup.",
        );
      }
      await applySignupPlanAndSpaces({
        userId: user.id,
        name: resolvedName,
        shortName: resolvedShort,
        email,
        plan: signupPlan,
        workspaceName: DEFAULT_PERSONAL_WORKSPACE_NAME,
        workspaceKind: "personal",
      });
      const wsId = workspaceId || workspaceIdFromUserId(user.id);
      setWorkspaceId(wsId);
      persistWorkspace(wsId);
      const connectedIds = (
        getConnectorConnectionsSnapshot()[wsId] ?? []
      )
        .filter((row) => isUiConnectedStatus(row.status))
        .map((row) => row.connectorId);
      setOnboardingComposerHint(composerHintForConnectedApps(connectedIds));
      await enterWithPlan(signupPlan);
      return;
    }

    const created = createWorkspace({
      name: DEFAULT_PERSONAL_WORKSPACE_NAME,
      kind: "personal",
    });
    if (created) {
      persistWorkspace(created.id);
      setWorkspace(created.id);
      setWorkspaceId(created.id);
      const connectedIds = (
        getConnectorConnectionsSnapshot()[created.id] ?? []
      )
        .filter((row) => isUiConnectedStatus(row.status))
        .map((row) => row.connectorId);
      setOnboardingComposerHint(composerHintForConnectedApps(connectedIds));
    } else {
      setOnboardingComposerHint(composerHintForConnectedApps([]));
    }
    await enterWithPlan(signupPlan);
  };

  const applySetup = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await finishLocalAccount();
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message || "")
          : err instanceof Error
            ? err.message
            : "";
      // Invite failures already wrote the account — don't auto-enter and hide the error.
      const inviteFailed = /invite/i.test(message);
      if (!inviteFailed) {
        const recovered = await tryEnterExistingAccount().catch(() => false);
        if (recovered) return;
      }
      console.error("[cander] finish account failed", err);
      setError(
        message.trim() ||
          "Could not create account. Check the browser console for details.",
      );
    } finally {
      setBusy(false);
    }
  };

  const beginSignup = async () => {
    if (!name.trim()) {
      setError("Add your name to continue.");
      return;
    }
    if (!email.trim().includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    if (!shortName.trim()) {
      setShortName(name.trim().split(/\s+/)[0] || "You");
    }

    if (!isSupabaseConfigured()) {
      setError("Sign in uses your live Cander account. This session is not connected to the account service.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    setError("");
    setInfo("");
    persistOnboardingPending(true);
    reportAuthEvent({
      eventType: "signup_started",
      email,
      metadata: { name: name.trim() },
    });
    try {
      const result = await signUpWithPassword({ email, password, name });
      if (result.session?.user) syncSupabaseAuthUser(result.session.user);
      // Existing email (enumeration-safe): empty identities, no session.
      const maybeExisting =
        result.user &&
        Array.isArray(result.user.identities) &&
        result.user.identities.length === 0;

      if (maybeExisting) {
        reportAuthEvent({
          eventType: "signup_existing",
          email,
          profileId: result.user?.id,
        });
        try {
          const signInResult = await signInWithPassword({ email, password });
          if (signInResult.user) syncSupabaseAuthUser(signInResult.user);
          const entered = await tryEnterExistingAccount();
          if (entered) {
            reportAuthEvent({
              eventType: "signed_in",
              email,
              profileId: signInResult.user?.id,
              metadata: { via: "signup_existing" },
            });
            return;
          }
          if (!isAuthEmailConfirmed(signInResult.user)) {
            persistPendingSignupEmail(email);
            persistOnboardingPending(true);
            setPassedVerify(false);
            setInfo("We sent a code to your email. Enter it below to continue.");
            setStep("verify");
            return;
          }
          persistOnboardingPending(true);
          setPassedVerify(true);
          if (signInResult.user?.id) await syncPlanFromProfile(signInResult.user.id);
          setStep(stepAfterEmailVerified());
          return;
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Could not sign in.";
          if (/confirm|not confirmed|verif/i.test(message)) {
            persistPendingSignupEmail(email);
            setInfo("We sent a code to your email. Enter it below to continue.");
            setStep("verify");
            return;
          }
          persistOnboardingPending(false);
          setError("An account with this email already exists. Sign in instead.");
          setStep("sign-in");
          return;
        }
      }

      reportAuthEvent({
        eventType: "signup_created",
        email,
        profileId: result.user?.id,
        metadata: {
          hasSession: Boolean(result.session),
          confirmEmailRequired: !result.session,
        },
      });

      // Session only counts if Auth has confirmed the email — otherwise OTP.
      if (result.session && isAuthEmailConfirmed(result.session.user)) {
        clearPendingSignupEmail();
        setPassedVerify(true);
        if (result.session.user.id) await syncPlanFromProfile(result.session.user.id);
        setStep(stepAfterEmailVerified());
        return;
      }

      // Confirm-email on — stay in-app and enter the code from email.
      persistPendingSignupEmail(email);
      setPassedVerify(false);
      setStep("verify");
      setInfo(`We sent an ${SIGNUP_OTP_LENGTH}-digit code to ${email.trim()}. Paste it below — no need to leave this screen.`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create account.";
      if (/already|registered|exists/i.test(message)) {
        try {
          const signInResult = await signInWithPassword({ email, password });
          if (signInResult.user) syncSupabaseAuthUser(signInResult.user);
          const entered = await tryEnterExistingAccount();
          if (entered) return;
          if (!isAuthEmailConfirmed(signInResult.user)) {
            persistPendingSignupEmail(email);
            persistOnboardingPending(true);
            setPassedVerify(false);
            setInfo("Confirm your email with the code we sent, then continue.");
            setStep("verify");
            return;
          }
          persistOnboardingPending(true);
          setPassedVerify(true);
          if (signInResult.user?.id) await syncPlanFromProfile(signInResult.user.id);
          setStep(stepAfterEmailVerified());
          return;
        } catch (signInErr) {
          const signInMessage =
            signInErr instanceof Error ? signInErr.message : message;
          if (/confirm|not confirmed|verif/i.test(signInMessage)) {
            persistPendingSignupEmail(email);
            setInfo("Confirm your email with the code we sent, then continue.");
            setStep("verify");
            return;
          }
          persistOnboardingPending(false);
          setError("An account with this email already exists. Sign in instead.");
          setStep("sign-in");
          return;
        }
      }
      persistOnboardingPending(false);
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const confirmVerify = async (codeOverride?: string) => {
    if (!isSupabaseConfigured()) {
      setError("This session is not connected to the account service.");
      return;
    }
    const code = digitsOnly(codeOverride ?? verifyCode, SIGNUP_OTP_LENGTH);
    if (code.length < SIGNUP_OTP_LENGTH) {
      setError(`Enter the ${SIGNUP_OTP_LENGTH}-digit code from your email.`);
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    setInfo("");
    setVerifyCode(code);
    try {
      const result = await verifySignupOtp(email, code);
      if (result.user) syncSupabaseAuthUser(result.user);
      if (!isAuthEmailConfirmed(result.user)) {
        setError("That code didn’t confirm your email. Try again or resend.");
        return;
      }
      reportAuthEvent({
        eventType: "email_verified",
        email,
        profileId: result.user?.id,
        metadata: { method: "otp" },
      });
      clearPendingSignupEmail();
      setPassedVerify(true);
      setVerifyCode("");
      const entered = await tryEnterExistingAccount().catch(() => false);
      if (entered) return;
      if (result.user?.id) await syncPlanFromProfile(result.user.id);
      setStep(stepAfterEmailVerified());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "That code didn’t work. Try again or resend.",
      );
    } finally {
      setBusy(false);
    }
  };

  const resendVerify = async () => {
    if (!email.trim().includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setInfo(`We’ll send a code to ${email.trim()} when email is connected.`);
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    try {
      persistPendingSignupEmail(email);
      await resendSignupEmail(email);
      setInfo(`New code sent to ${email.trim()}.`);
    } catch (err) {
      // Wrong / new address — try creating the account for that email instead.
      try {
        if (password.length >= 8) {
          await signUpWithPassword({ email, password, name });
          persistPendingSignupEmail(email);
          setInfo(`We sent a code to ${email.trim()}.`);
        } else {
          throw err;
        }
      } catch (resendErr) {
        setError(
          resendErr instanceof Error
            ? resendErr.message
            : "Could not resend the code.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    if (usingSupabase) {
      setError("");
      setInfo("");
      setBusy(true);
      try {
        const result = await signInWithPassword({ email, password });
        if (result.user) syncSupabaseAuthUser(result.user);
        reportAuthEvent({
          eventType: "signed_in",
          email,
          profileId: result.user?.id,
        });
        if (!isAuthEmailConfirmed(result.user)) {
          persistPendingSignupEmail(email);
          persistOnboardingPending(true);
          setPassedVerify(false);
          setInfo("We sent a code to your email. Enter it below to continue.");
          setStep("verify");
          return;
        }
        const entered = await tryEnterExistingAccount();
        if (entered) return;
        persistOnboardingPending(true);
        setPassedVerify(true);
        if (result.user?.id) await syncPlanFromProfile(result.user.id);
        setStep(stepAfterEmailVerified());
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Sign in failed.";
        if (/confirm|not confirmed|verif/i.test(message)) {
          persistPendingSignupEmail(email);
          persistOnboardingPending(true);
          setInfo("We sent a code to your email. Enter it below to continue.");
          setStep("verify");
        } else {
          setError(message);
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!email.trim().includes("@")) {
      setError("Enter the email for your account.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setError(
      "Sign in uses your live Cander account. This session is not connected to the account service.",
    );
  };

  const sendForgot = async () => {
    setError("");
    setInfo("");
    if (!email.trim().includes("@")) {
      setError("Enter the email for your account.");
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(email);
      reportAuthEvent({
        eventType: "password_reset_requested",
        email,
      });
      setInfo(`If an account exists for ${email.trim()}, we sent a reset link.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setBusy(false);
    }
  };


  useEffect(() => {
    if (step !== "apps" || workspaceId || !isSupabaseConfigured()) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token || cancelled) return;
        const id = await bootstrapPersonalWorkspace(session.access_token);
        if (cancelled) return;
        setWorkspaceId(id);
        persistWorkspace(id);
        persistOnboardingCheckpoint({
          ...buildCheckpoint(),
          step: "apps",
          workspaceId: id,
        });
      } catch (err) {
        if (!cancelled) {
          // Fall back to deterministic id so Apps UI can still render.
          const {
            data: { user },
          } = await createSupabaseBrowserClient().auth.getUser();
          if (user?.id) {
            const fallback = workspaceIdFromUserId(user.id);
            setWorkspaceId(fallback);
          } else {
            setError(
              err instanceof Error
                ? err.message
                : "Could not prepare workspace.",
            );
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once per apps entry
  }, [step, workspaceId]);

  const goCreateNext = () => {
    if (step === "create") {
      void beginSignup();
    }
  };

  const goBack = () => {
    setError("");
    setInfo("");
    if (step === "forgot") {
      setStep("sign-in");
      return;
    }
    if (step === "verify") {
      setStep("create");
      return;
    }
    if (step === "sign-in" || step === "create") {
      setStep("welcome");
      return;
    }
    if (step === "plan") {
      // Verified session — don't send them back through create/verify.
      return;
    }
    if (step === "apps") {
      setStep("plan");
      return;
    }
    const idx = createSteps.indexOf(step);
    if (idx > 0) setStep(createSteps[idx - 1]);
  };

  const showBack =
    step !== "welcome" &&
    !(usingSupabase && passedVerify && (step === "plan" || step === "apps"));

  const panel = PANEL_COPY[step];
  const fullWidthStep = step === "apps";

  return (
    <AppearanceScope
      syncSideEffects
      className="flex h-svh w-full flex-col overflow-hidden bg-background text-foreground lg:flex-row"
    >
      {/* Left: auth / onboarding — 50% on desktop; full width for apps. */}
      <div
        className={cn(
          "relative flex min-h-0 w-full flex-1 flex-col pt-[var(--desktop-titlebar)] lg:flex-none",
          fullWidthStep ? "lg:w-full" : "lg:w-1/2",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto px-6 sm:px-10",
            mobile ? "pt-[calc(env(safe-area-inset-top,0px)+50px)] pb-36" : "pt-8 sm:pt-10 pb-10",
          )}
        >
          <div
            className={cn(
              "mx-auto w-full",
              fullWidthStep ? "max-w-3xl" : "max-w-[26rem]",
            )}
          >
            {/* Fixed-height back row — same top edge on every step. */}
            <div className="mb-8 flex h-9 items-center">
              {showBack ? (
                <button
                  type="button"
                  onClick={goBack}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 border border-foreground/10 bg-background px-3 text-[13px] font-medium tracking-[-0.01em] text-foreground transition-colors duration-150 hover:border-foreground/20 hover:bg-muted rounded-[10px]",
                  )}
                >
                  <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
                  Back
                </button>
              ) : null}
            </div>

            {step === "welcome" ? (
              <WelcomeStep
                onSignIn={() => {
                  setError("");
                  setInfo("");
                  setStep("sign-in");
                }}
                onCreate={() => {
                  setError("");
                  setInfo("");
                  setStep("create");
                }}
                onOAuthError={setError}
                error={error}
                busy={busy}
              />
            ) : null}

            {step === "sign-in" ? (
              <SignInStep
                email={email}
                password={password}
                error={error}
                busy={busy}
                onEmail={(value) => {
                  setEmail(value);
                  setError("");
                }}
                onPassword={(value) => {
                  setPassword(value);
                  setError("");
                }}
                onSubmit={() => void signIn()}
                onForgot={() => {
                  setError("");
                  setInfo("");
                  setStep("forgot");
                }}
                onOAuthError={setError}
              />
            ) : null}

            {step === "forgot" ? (
              <ForgotStep
                email={email}
                error={error}
                info={info}
                busy={busy}
                onEmail={(value) => {
                  setEmail(value);
                  setError("");
                  setInfo("");
                }}
                onSubmit={() => void sendForgot()}
              />
            ) : null}

            {step === "create" ? (
              <CreateStep
                name={name}
                email={email}
                password={password}
                error={error}
                busy={busy}
                onName={(value) => {
                  setName(value);
                  setError("");
                }}
                onEmail={(value) => {
                  setEmail(value);
                  setError("");
                }}
                onPassword={(value) => {
                  setPassword(value);
                  setError("");
                }}
                onSubmit={goCreateNext}
                onOAuthError={setError}
              />
            ) : null}

            {step === "verify" ? (
              <VerifyStep
                email={email}
                code={verifyCode}
                error={error}
                info={info}
                busy={busy}
                onEmail={(value) => {
                  setEmail(value);
                  setError("");
                  setInfo("");
                }}
                onCode={(value) => {
                  setVerifyCode(value);
                  setError("");
                }}
                onSubmit={(code) => void confirmVerify(code)}
                onResend={() => void resendVerify()}
              />
            ) : null}

            {step === "plan" ? (
              <PlanStep
                selectedPlan={plan}
                busy={busy}
                error={error}
                info={info}
                onChoose={(value) => {
                  void simulateSubscribeAndContinue(value);
                }}
              />
            ) : null}

            {step === "apps" && workspaceId ? (
              <OnboardingAppsStep
                workspaceId={workspaceId}
                plan={plan ?? "minimal"}
                busy={busy}
                onContinue={() => void applySetup()}
                onSkip={() => void applySetup()}
              />
            ) : null}

            {step === "apps" && !workspaceId ? (
              <div className="space-y-3">
                <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
                  Preparing workspace…
                </h1>
                <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                  Hang tight while we set up your personal workspace.
                </p>
                {error ? (
                  <p className="text-[12.5px] text-destructive">{error}</p>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void applySetup()}
                  className={cn("inline-flex items-center gap-2", primaryBtnClass)}
                >
                  Enter Cander
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : null}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {mobile && step !== "plan" && step !== "apps" ? (
        <OnboardingMobilePanel step={step} />
      ) : null}

      {/* Right: full half-screen preview — hidden on apps */}
      {!fullWidthStep ? (
        <div className="hidden min-h-0 w-1/2 lg:block">
          <div
            className="relative h-full min-h-0 overflow-hidden border-l border-border"
            aria-hidden
          >
            <CanderMark
              tone="white"
              className="absolute top-6 right-6 z-20 h-7 w-7"
            />
            <div className="absolute inset-0 panel-wash-price" />
            <div className="panel-grain" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
            <div className="absolute inset-x-0 bottom-0 p-10 xl:p-14">
              <p
                className={cn(
                  "font-medium tracking-[-0.03em] text-white",
                  step === "welcome"
                    ? "whitespace-nowrap text-[1.45rem] xl:text-[1.65rem]"
                    : "max-w-lg text-[1.75rem] xl:text-[2rem]",
                )}
              >
                {panel.title}
              </p>
              {step === "plan" && plan ? (
                <ul
                  key={plan}
                  className="mt-6 max-w-md space-y-2.5 transition-all duration-300"
                  style={{
                    animation: "landing-enter 280ms ease-out",
                  }}
                >
                  {PLAN_PANEL_BULLETS[plan].map((item) => (
                    <li
                      key={item}
                      className="flex gap-2.5 text-[14px] leading-snug text-white/85"
                    >
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/80"
                        aria-hidden
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </AppearanceScope>
  );
}


function WelcomeStep({
  onSignIn,
  onCreate,
  onOAuthError,
  error,
  busy = false,
}: {
  onSignIn: () => void;
  onCreate: () => void;
  onOAuthError?: (message: string) => void;
  error?: string;
  busy?: boolean;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Welcome
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Sign in or create an account to get started.
      </p>
      <div className="mt-8 space-y-4">
        <OAuthButtons disabled={busy} onError={onOAuthError} />
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-foreground/10" />
          <span className="text-[12px] text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-foreground/10" />
        </div>
        <button type="button" onClick={onCreate} className={primaryBtnClass}>
          Continue with Email
        </button>
        <button type="button" onClick={onSignIn} className={secondaryBtnClass}>
          Sign in
        </button>
      </div>
      {error ? (
        <p className="mt-4 text-[12.5px] text-destructive">{error}</p>
      ) : null}
      <p className="mt-8 text-[12.5px] leading-relaxed text-muted-foreground">
        Simple to join. Simple to leave. Your account and connected data stay
        under your control.
      </p>
    </>
  );
}

function SignInStep({
  email,
  password,
  error,
  busy = false,
  onEmail,
  onPassword,
  onSubmit,
  onForgot,
  onOAuthError,
}: {
  email: string;
  password: string;
  error: string;
  busy?: boolean;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: () => void;
  onForgot?: () => void;
  onOAuthError?: (message: string) => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Sign in
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Use Apple, Google, or the email and password for your Cander account.
      </p>
      <div className="mt-8">
        <OAuthButtons disabled={busy} onError={onOAuthError} />
      </div>
      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-foreground/10" />
        <span className="text-[12px] text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-foreground/10" />
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Field label="Email">
          <input
            value={email}
            onChange={(event) => onEmail(event.target.value)}
            autoComplete="username"
            name="cander-email"
            className={inputClass}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(event) => onPassword(event.target.value)}
            autoComplete="current-password"
            name="cander-password"
            placeholder=""
            className={inputClass}
          />
        </Field>
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className={primaryBtnClass}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {onForgot ? (
        <button
          type="button"
          onClick={onForgot}
          className="mt-4 text-[13px] text-muted-foreground hover:text-foreground"
        >
          Forgot password?
        </button>
      ) : null}
    </>
  );
}

function ForgotStep({
  email,
  error,
  info,
  busy,
  onEmail,
  onSubmit,
}: {
  email: string;
  error: string;
  info: string;
  busy: boolean;
  onEmail: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Reset password
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Enter your account email. We’ll send a link to choose a new password.
      </p>
      <form
        className="mt-8 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(event) => onEmail(event.target.value)}
            autoComplete="username"
            className={inputClass}
          />
        </Field>
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
        {info ? (
          <p className="text-[12.5px] text-muted-foreground">{info}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className={primaryBtnClass}
        >
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </>
  );
}

function CreateStep({
  name,
  email,
  password,
  error,
  busy,
  onName,
  onEmail,
  onPassword,
  onSubmit,
  onOAuthError,
}: {
  name: string;
  email: string;
  password: string;
  error: string;
  busy?: boolean;
  onName: (value: string) => void;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: () => void;
  onOAuthError?: (message: string) => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Create account
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Basics first. Next we&apos;ll email you a code — paste it here
        to confirm, then finish setup.
      </p>
      <div className="mt-8">
        <OAuthButtons disabled={busy} onError={onOAuthError} />
      </div>
      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-foreground/10" />
        <span className="text-[12px] text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-foreground/10" />
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Field label="Full name">
          <input
            value={name}
            onChange={(event) => onName(event.target.value)}
            autoComplete="name"
            className={inputClass}
          />
        </Field>
        <Field label="Email">
          <input
            value={email}
            onChange={(event) => onEmail(event.target.value)}
            autoComplete="email"
            className={inputClass}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(event) => onPassword(event.target.value)}
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className={primaryBtnClass}
        >
          {busy ? "Creating…" : "Continue"}
        </button>
      </form>
    </>
  );
}

function VerifyStep({
  email,
  code,
  error,
  info,
  busy,
  onEmail,
  onCode,
  onSubmit,
  onResend,
}: {
  email: string;
  code: string;
  error: string;
  info: string;
  busy: boolean;
  onEmail: (value: string) => void;
  onCode: (value: string) => void;
  onSubmit: (code?: string) => void;
  onResend: () => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Enter your code
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        We emailed an {SIGNUP_OTP_LENGTH}-digit code to{" "}
        <span className="font-medium text-foreground">{email.trim() || "your inbox"}</span>.
        Paste it here to stay in the app — no link required. Wrong address?
        Update the email and resend.
      </p>
      <form
        className="mt-8 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(code);
        }}
      >
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(event) => onEmail(event.target.value)}
            autoComplete="email"
            className={inputClass}
          />
        </Field>
        <Field label="Verification code">
          <VerifyCodeInput
            value={code}
            disabled={busy}
            autoFocus
            onChange={onCode}
            onComplete={(value) => onSubmit(value)}
          />
        </Field>
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
        {info ? (
          <p className="text-[12.5px] text-muted-foreground">{info}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className={primaryBtnClass}
        >
          {busy ? "Verifying…" : "Verify email"}
        </button>
      </form>
      <button
        type="button"
        disabled={busy}
        onClick={onResend}
        className={cn("mt-3", ghostBtnClass)}
      >
        Resend code
      </button>
    </>
  );
}

function PlanStep({
  selectedPlan,
  busy,
  error,
  info = "",
  onChoose,
}: {
  selectedPlan: BillingPlan | null;
  busy: boolean;
  error: string;
  info?: string;
  onChoose: (plan: BillingPlan) => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Choose a plan
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Pick access. You can change this later.
      </p>
      <div className="mt-8 space-y-2.5">
        {SELF_SERVE_PLANS.map((planId) => {
          const entry = PLAN_CATALOG[planId];
          const active = selectedPlan === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              disabled={busy}
              onClick={() => onChoose(entry.id)}
              className={cn(
                "flex w-full flex-col gap-1 border px-3.5 py-3.5 text-left transition-colors duration-200",
                SHELL_G3_RADIUS,
                active
                  ? onboardingSelectorActiveClass
                  : onboardingSelectorIdleClass,
                busy && "opacity-60",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14.5px] font-medium tracking-[-0.01em]">
                  {entry.name}
                </span>
                <span className="text-[13.5px] font-medium tabular-nums text-foreground">
                  {formatPlanPrice(entry.id)}
                </span>
              </div>
              <span className="text-[12.5px] leading-relaxed text-muted-foreground">
                {formatPlanUsageLevel(entry.id)}
                {entry.id === "minimal"
                  ? " · 1 account per App"
                  : " · multiple accounts per App"}
              </span>
              <span className="mt-1 text-[12px] font-medium text-foreground/80">
                {busy && active ? "Saving…" : entry.ctaLabel}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-5 text-[12.5px] text-muted-foreground">
        Need something custom?{" "}
        <a
          href={LIMITLESS_CONTACT_HREF}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Contact us about Limitless
        </a>
        .
      </p>
      {error ? (
        <p className="mt-4 text-[12.5px] text-destructive">{error}</p>
      ) : null}
      {info ? (
        <p className="mt-4 text-[12.5px] text-muted-foreground">{info}</p>
      ) : null}
    </>
  );
}

const inputClass = cn(
  "onboarding-input h-11 w-full border border-foreground/12 bg-transparent px-3.5 text-[14px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/12 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
  SHELL_G3_RADIUS,
);

const primaryBtnClass = cn(
  "inline-flex h-11 w-full items-center justify-center bg-primary text-[14px] font-medium tracking-[-0.01em] text-primary-foreground transition-colors duration-150 hover:bg-foreground disabled:opacity-50",
  SHELL_G3_RADIUS,
);

const secondaryBtnClass = cn(
  "inline-flex h-11 w-full items-center justify-center border border-foreground/12 bg-background text-[14px] font-medium tracking-[-0.01em] transition-colors duration-150 hover:border-foreground/20 hover:bg-muted disabled:opacity-50",
  SHELL_G3_RADIUS,
);

const ghostBtnClass = cn(
  "inline-flex h-10 w-full items-center justify-center text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:opacity-60",
  SHELL_G3_RADIUS,
);

const onboardingSelectorActiveClass =
  "border-foreground bg-muted ring-2 ring-foreground/10 shadow-sm";
const onboardingSelectorIdleClass =
  "border-foreground/10 bg-background hover:border-foreground/20 hover:bg-muted/60";

function OnboardingMobilePanel({ step }: { step: Step }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
      <div
        className={cn(
          "relative overflow-hidden p-5 shadow-[0_-12px_40px_oklch(0_0_0/0.18)]",
          SHELL_G3_RADIUS,
        )}
      >
        <div className="absolute inset-0 panel-wash-price" aria-hidden />
        <div className="panel-grain" aria-hidden />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10"
          aria-hidden
        />
        <p className="relative text-[15px] font-medium tracking-[-0.02em] text-white">
          {MOBILE_PANEL_LINE[step]}
        </p>
      </div>
    </div>
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
      <span className="mb-1.5 block text-[12.5px] font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
