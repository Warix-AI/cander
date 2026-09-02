"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { CanderMark } from "@/components/brand/CanderMark";
import { useApp } from "@/components/app/AppProvider";
import { connectors } from "@/lib/data";
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
import { syncSupabaseAuthUser } from "@/lib/supabase/auth-store";
import { setupOrgOnSupabase } from "@/lib/supabase/setup-org-onboarding";
import { AppearanceControls } from "@/components/settings/AppearanceControls";
import { HostingModePicker } from "@/components/settings/HostingModePicker";
import { OnboardingAppPreview } from "@/components/onboarding/OnboardingAppPreview";
import { VerifyCodeInput } from "@/components/onboarding/VerifyCodeInput";
import { AppearanceScope } from "@/components/theme/AppearanceProvider";
import { resetAppearance, setColorMode } from "@/lib/appearance";
import type { AccountPresetId, BillingPlan, Member } from "@/lib/types";
import { createWorkspace } from "@/lib/workspace-catalog";
import {
  addPendingOrgInvite,
  upsertOrgMember,
} from "@/lib/workspace-policy";
import {
  clearOrgOnboardingDraft,
  emptyOrgInvite,
  inviteDisplayName,
  getOrgInviteDraftSnapshot,
  getOrgNameSnapshot,
  persistOrgInviteDraft,
  persistOrgName,
  persistOrgSetupDeferred,
  type OrgInviteDraft,
} from "@/lib/org-onboarding";
import { isMobileShell } from "@/lib/mobile-shell";
import {
  clearOnboardingCheckpoint,
  getOnboardingCheckpointSnapshot,
  persistOnboardingCheckpoint,
  resumeStepForPlan,
  type OnboardingCheckpoint,
} from "@/lib/onboarding-checkpoint";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { completeEmailVerificationFromUrl } from "@/lib/auth/email-verify-landing";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const INVITE_SEND_WARNING_KEY = "cander-invite-send-warning";
const supabaseMode = () => isSupabaseConfigured();

function presetForPlan(plan: BillingPlan): AccountPresetId {
  if (plan === "free") return "free";
  if (plan === "pro") return "pro";
  return "max-owner";
}

type MaxIntent = "personal" | "org-now" | "org-later";

type Step =
  | "welcome"
  | "sign-in"
  | "forgot"
  | "create"
  | "verify"
  | "profile"
  | "plan"
  | "max-intent"
  | "org-setup"
  | "workspace"
  | "appearance"
  | "hosting"
  | "connectors";

function createStepsFor(
  nativeShell: boolean,
  plan: BillingPlan | null,
  maxIntent: MaxIntent | null,
): Step[] {
  const steps: Step[] = ["create", "profile"];
  if (!nativeShell) {
    steps.push("plan");
    if (plan === "max") steps.push("max-intent");
    if (maxIntent === "org-now") steps.push("org-setup");
    if (plan && plan !== "free") steps.push("workspace");
  }
  if (SHOW_ONBOARDING_CONNECTORS) steps.push("connectors");
  steps.push("appearance");
  if (nativeShell) steps.push("hosting");
  return steps;
}

const DEFAULT_FREE_WORKSPACE_NAME = "First Workspace";

/** Rows with any field filled — persisted as org invite drafts. */
function invitesToPersist(rows: OrgInviteDraft[]) {
  return rows.filter(
    (row) =>
      row.firstName.trim() ||
      row.lastName.trim() ||
      row.email.trim(),
  );
}

function validInviteRows(rows: OrgInviteDraft[]) {
  return rows.filter((row) => row.email.trim().includes("@"));
}

const ONBOARDING_CONNECTORS = ["gmail", "slack", "gcal", "notion", "github", "linear"];

/** Connectors onboarding is hidden until real installs ship. */
const SHOW_ONBOARDING_CONNECTORS = false;

function resolveInitialOnboardingStep(initialSignedIn: boolean): Step {
  if (typeof window !== "undefined") {
    const auth = new URLSearchParams(window.location.search).get("auth");
    if (auth === "verified") return "profile";
  }
  if (initialSignedIn || getOnboardingPendingSnapshot()) return "profile";
  return "welcome";
}

const PLANS: {
  id: BillingPlan;
  title: string;
  price: string;
  body: string;
}[] = [
  {
    id: "free",
    title: "Free",
    price: "$0",
    body: "Unlimited AI · Work, Build, Explore · Connectors",
  },
  {
    id: "pro",
    title: "Pro",
    price: "$20/mo",
    body: "Higher AI capacity · Voice & memory · Up to 3 workspaces",
  },
  {
    id: "max",
    title: "Max",
    price: "$50/mo",
    body: "Highest AI capacity · Shared workspaces · Org invites & controls",
  },
];

const PLAN_PANEL_BULLETS: Record<BillingPlan, string[]> = {
  free: [
    "Unlimited AI at standard capacity",
    "Work, Build, Explore, and Connectors",
    "Persistent memory included",
    "Upgrade anytime for more power",
  ],
  pro: [
    "Unlimited AI at expanded capacity",
    "Voice, advanced memory, knowledge bases",
    "Up to three visible workspaces",
    "Built for individuals",
  ],
  max: [
    "Unlimited AI at maximum capacity",
    "Shared workspaces and member invites",
    "Roles, permissions, and org controls",
    "Built for teams and power users",
  ],
};

const PANEL_COPY: Record<
  Step,
  { title: string; body: string }
> = {
  welcome: {
    title: "Operate, build, and explore in one place.",
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
    body: "We’ll walk through profile, plan, and appearance — then open the app.",
  },
  verify: {
    title: "Confirm it’s you.",
    body: "Enter the code we emailed to finish confirming your account.",
  },
  profile: {
    title: "It should sound like it knows you.",
    body: "A short name keeps replies personal without cluttering every thread.",
  },
  plan: {
    title: "Choose the depth you need.",
    body: "Free to start. Pro and Max unlock more capacity. Until billing is connected, paid plans unlock for testing without a charge.",
  },
  "max-intent": {
    title: "How will you use Max?",
    body: "Personal power or a team organization — you can change this later.",
  },
  "org-setup": {
    title: "Set up your organization.",
    body: "Invite teammates now or later. Emails send when Resend is configured; otherwise you’ll get invite links.",
  },
  workspace: {
    title: "Name the place you’ll work from.",
    body: "Name the workspace you’ll land in.",
  },
  connectors: {
    title: "Apps you’ll use.",
    body: "Mark what you care about. Real connections happen later in Connectors — nothing is installed yet.",
  },
  appearance: {
    title: "Make it feel like yours.",
    body: "Pick a color mode — watch the preview update as you go.",
  },
  hosting: {
    title: "Where should AI run?",
    body: "Cloud always works. On device uses Apple Intelligence on this phone when available. Auto picks for you.",
  },
};

/** One-line copy for the mobile gradient card (7–8 words). */
const MOBILE_PANEL_LINE: Record<Step, string> = {
  welcome: "Operate, build, and explore in one place.",
  "sign-in": "Pick up where you left off.",
  forgot: "Reset your password with an email link.",
  create: "Create an account, then finish setup.",
  verify: "Enter the code we sent to your email.",
  profile: "Choose a name Cander should use for you.",
  plan: "Choose the depth you need today.",
  "max-intent": "How will you use Max?",
  "org-setup": "Set up your organization and invite teammates.",
  workspace: "Name the workspace you'll land in.",
  connectors: "Apps you'll use with Cander later.",
  appearance: "Make it feel like yours.",
  hosting: "Choose Cloud, Auto, or On device.",
};

/**
 * Full-screen auth + onboarding when no session is present.
 * Desktop: 50/50 form left, banner wash right.
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
  const nativeShell = isMobileShell();
  const mobile = useMobileShell();
  const usingSupabase = supabaseMode();
  const [step, setStep] = useState<Step>(() =>
    resolveInitialOnboardingStep(initialSignedIn),
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [plan, setPlan] = useState<BillingPlan | null>(
    nativeShell ? "free" : null,
  );
  const [maxIntent, setMaxIntent] = useState<MaxIntent | null>(null);
  const [orgName, setOrgName] = useState("");
  const [orgInvites, setOrgInvites] = useState<OrgInviteDraft[]>([]);
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [passedVerify, setPassedVerify] = useState(initialSignedIn);
  const orgDraftHydrated = useRef(false);

  // Onboarding always opens in light — ignore prior session / system dark.
  useLayoutEffect(() => {
    setColorMode("light");
  }, []);

  // Email-verify link — sync session immediately so profile step is authenticated.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    void completeEmailVerificationFromUrl().then(async (result) => {
      if (result === "verified") {
        const entered = await tryEnterExistingAccount().catch(() => false);
        if (entered) return;
        persistOnboardingPending(true);
        setPassedVerify(true);
        setStep("profile");
        setError("");
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
        return;
      }
      if (result === "error") {
        setError("Email link expired or invalid. Sign in or request a new code.");
        setStep("sign-in");
      }
    });
  }, []);

  // Resume mid-onboarding after refresh / email link — fill name + email from session.
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
    if (step !== "org-setup") {
      orgDraftHydrated.current = false;
      return;
    }
    if (orgDraftHydrated.current) return;
    orgDraftHydrated.current = true;
    const savedName = getOrgNameSnapshot();
    if (savedName && !orgName.trim()) setOrgName(savedName);
    const savedInvites = getOrgInviteDraftSnapshot();
    if (savedInvites.length && !orgInvites.length) setOrgInvites(savedInvites);
  }, [step, orgName, orgInvites.length]);

  useEffect(() => {
    if (step !== "org-setup") return;
    persistOrgName(orgName);
    persistOrgInviteDraft(invitesToPersist(orgInvites));
  }, [step, orgName, orgInvites]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("onboarding") !== "resume") return;

    const restore = (cp: OnboardingCheckpoint) => {
      if (cp.plan) setPlan(cp.plan);
      if (cp.maxIntent) setMaxIntent(cp.maxIntent);
      if (cp.orgName) setOrgName(cp.orgName);
      if (Array.isArray(cp.orgInvites)) {
        setOrgInvites(cp.orgInvites as OrgInviteDraft[]);
      }
      if (cp.workspaceName) setWorkspaceName(cp.workspaceName);
      if (cp.shortName) setShortName(cp.shortName);
      if (cp.name) setName(cp.name);
      if (cp.email) setEmail(cp.email);
      if (cp.selectedConnectors) setSelectedConnectors(cp.selectedConnectors);
      setStep(resumeStepForPlan(cp.plan) as Step);
    };

    const local = getOnboardingCheckpointSnapshot();
    if (local?.plan) restore(local);

    void (async () => {
      if (!isSupabaseConfigured()) return;
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_checkpoint, plan, subscription_status")
        .eq("id", user.id)
        .maybeSingle();
      const cp = profile?.onboarding_checkpoint as OnboardingCheckpoint | null;
      if (cp?.plan) restore(cp);
      else if (profile?.plan && profile.plan !== "free") {
        setPlan(profile.plan as BillingPlan);
        setStep(resumeStepForPlan(profile.plan as BillingPlan) as Step);
      }
    })();

    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const buildCheckpoint = (): OnboardingCheckpoint => ({
    step,
    plan: plan ?? "free",
    maxIntent,
    orgName,
    orgInvites,
    workspaceName,
    shortName,
    name,
    email,
    selectedConnectors,
  });

  const startPaidCheckout = async (chosen: Extract<BillingPlan, "pro" | "max">) => {
    setBusy(true);
    setError("");
    persistOnboardingCheckpoint(buildCheckpoint());

    if (!isSupabaseConfigured()) {
      setBusy(false);
      setStep(chosen === "max" ? "max-intent" : "workspace");
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Sign in to continue checkout.");
      }

      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan: chosen,
          checkpoint: buildCheckpoint(),
        }),
      });
      const data = await response.json();
      if (!response.ok && !data.bypass) {
        throw new Error(data.error ?? "Checkout failed.");
      }
      if (data.bypass) {
        // Stripe not configured — server already unlocked the plan via admin.
        setPlan(chosen);
        setInfo(
          `${chosen === "max" ? "Max" : "Pro"} unlocked for testing. Billing is not connected yet — nothing was charged.`,
        );
        setStep(chosen === "max" ? "max-intent" : "workspace");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL returned.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setBusy(false);
    }
  };

  const createSteps = useMemo(
    () => createStepsFor(nativeShell, plan, maxIntent),
    [nativeShell, plan, maxIntent],
  );

  const applyOrgOwnerMember = (
    memberId: string,
    workspaceIds: string[],
    orgId?: string,
  ) => {
    const initials =
      name
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "ME";
    const isOrgNow = maxIntent === "org-now";
    const isDeferred = maxIntent === "org-later";
    const owner: Member = {
      id: memberId,
      name: name.trim() || "Owner",
      email: email.trim(),
      short: shortName.trim() || "You",
      initials,
      role: "Owner",
      workspaceIds,
      plan: "max",
      seatStatus: "active",
      kind: isOrgNow ? "org" : "personal",
      ...(orgId ? { orgId } : {}),
      ...(isDeferred ? { orgSetupDeferred: true } : {}),
    };
    upsertOrgMember(owner);

    if (isOrgNow && orgName.trim()) {
      persistOrgName(orgName.trim());
      persistOrgSetupDeferred(false);
      persistOrgInviteDraft(orgInvites);
      for (const invite of validInviteRows(orgInvites)) {
        if (!invite.email.trim().includes("@")) continue;
        addPendingOrgInvite({
          email: invite.email,
          name: inviteDisplayName(invite),
          plan: invite.plan,
          orgName: orgName.trim(),
          workspaceIds,
        });
      }
      clearOrgOnboardingDraft();
    }
    if (isDeferred) {
      persistOrgSetupDeferred(true);
    }
  };

  const connectorOptions = useMemo(
    () =>
      ONBOARDING_CONNECTORS.map((id) => connectors.find((item) => item.id === id)).filter(
        (item): item is (typeof connectors)[number] => Boolean(item),
      ),
    [],
  );

  const enterWithPlan = async (chosen: BillingPlan = "max") => {
    persistOnboardingPending(false);
    clearOnboardingCheckpoint();
    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        syncSupabaseAuthUser(user);
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

  const finishLocalAccount = async () => {
    // Connectors step only records interest — real OAuth installs happen later.
    const signupPlan = nativeShell ? "free" : (plan ?? "free");
    const isOrgNow = signupPlan === "max" && maxIntent === "org-now";
    const workspaceKind = isOrgNow ? "business" : "personal";
    const finalWorkspaceName =
      signupPlan === "free"
        ? DEFAULT_FREE_WORKSPACE_NAME
        : isOrgNow && orgName.trim()
          ? orgName.trim()
          : workspaceName.trim() || DEFAULT_FREE_WORKSPACE_NAME;

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
      await applySignupPlanAndSpaces({
        userId: user.id,
        name,
        shortName,
        email,
        plan: signupPlan,
        workspaceName: finalWorkspaceName,
        workspaceKind,
      });
      const wsId = `ws-${user.id.replace(/-/g, "")}`;
      let orgId: string | undefined;
      let inviteSendError = "";
      if (isOrgNow && orgName.trim()) {
        try {
          orgId = await setupOrgOnSupabase({
            orgName: orgName.trim(),
            workspaceId: wsId,
            invites: [],
          });
          const draftInvites = validInviteRows(orgInvites);
          if (draftInvites.length) {
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (!session?.access_token || !orgId) {
              inviteSendError =
                "Could not send invites (missing session). Retry from Settings → Organization.";
            } else {
              const inviteRes = await fetch("/api/org/invites/send", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  orgId,
                  workspaceIds: [wsId],
                  invites: draftInvites,
                }),
              });
              const inviteData = await inviteRes.json().catch(() => ({}));
              if (!inviteRes.ok) {
                inviteSendError =
                  typeof inviteData.error === "string" && inviteData.error.trim()
                    ? inviteData.error
                    : "Could not create invites. Retry from Settings → Organization.";
              } else {
                const results = Array.isArray(inviteData.results)
                  ? (inviteData.results as {
                      email: string;
                      inviteUrl: string;
                      sent: boolean;
                    }[])
                  : [];
                const unsent = results.filter((row) => !row.sent);
                if (unsent.length) {
                  const links = unsent
                    .map((row) => `${row.email}: ${row.inviteUrl}`)
                    .join(" · ");
                  inviteSendError = `Invites saved, but email was not sent (Resend not configured). Share these links: ${links}`;
                }
              }
            }
          }
        } catch (orgErr) {
          throw orgErr instanceof Error
            ? orgErr
            : new Error("Could not set up organization.");
        }
      }
      if (signupPlan === "max" && maxIntent && maxIntent !== "personal") {
        applyOrgOwnerMember(user.id, [wsId], orgId);
      }
      if (inviteSendError && typeof window !== "undefined") {
        window.sessionStorage.setItem(INVITE_SEND_WARNING_KEY, inviteSendError);
      }
      await enterWithPlan(signupPlan);
      return;
    }

    const created = createWorkspace({
      name: finalWorkspaceName,
      kind: workspaceKind,
    });
    if (created) {
      persistWorkspace(created.id);
      setWorkspace(created.id);
      if (signupPlan === "max" && maxIntent && maxIntent !== "personal") {
        const ownerId = `local-${email.trim().toLowerCase().replace(/[^a-z0-9]/gi, "") || "owner"}`;
        applyOrgOwnerMember(ownerId, [created.id]);
        persistActor(ownerId);
      }
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
    try {
      const result = await signUpWithPassword({ email, password, name });
      if (result.session?.user) syncSupabaseAuthUser(result.session.user);
      // Existing email (enumeration-safe): empty identities, no session.
      const maybeExisting =
        result.user &&
        Array.isArray(result.user.identities) &&
        result.user.identities.length === 0;

      if (maybeExisting) {
        try {
          const signInResult = await signInWithPassword({ email, password });
          if (signInResult.user) syncSupabaseAuthUser(signInResult.user);
          const entered = await tryEnterExistingAccount();
          if (entered) return;
          persistOnboardingPending(true);
          setPassedVerify(true);
          setStep("profile");
          return;
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Could not sign in.";
          if (/confirm|not confirmed|verif/i.test(message)) {
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

      // Always show verify in the flow. Confirm email may be off — bypass is available.
      setPassedVerify(false);
      setStep("verify");
      setInfo(result.session ? "" : `We sent a code to ${email.trim()}.`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create account.";
      if (/already|registered|exists/i.test(message)) {
        try {
          const signInResult = await signInWithPassword({ email, password });
          if (signInResult.user) syncSupabaseAuthUser(signInResult.user);
          const entered = await tryEnterExistingAccount();
          if (entered) return;
          persistOnboardingPending(true);
          setPassedVerify(true);
          setStep("profile");
          return;
        } catch (signInErr) {
          const signInMessage =
            signInErr instanceof Error ? signInErr.message : message;
          if (/confirm|not confirmed|verif/i.test(signInMessage)) {
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

  const confirmVerify = async () => {
    if (!isSupabaseConfigured()) {
      setError("This session is not connected to the account service.");
      return;
    }
    const code = verifyCode.replace(/\s/g, "");
    if (code.length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
      try {
        const result = await verifySignupOtp(email, code);
        if (result.user) syncSupabaseAuthUser(result.user);
        setPassedVerify(true);
      setVerifyCode("");
      setStep("profile");
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
      await resendSignupEmail(email);
      setInfo(`New code sent to ${email.trim()}.`);
    } catch (err) {
      // Wrong / new address — try creating the account for that email instead.
      try {
        if (password.length >= 8) {
          await signUpWithPassword({ email, password, name });
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
        const entered = await tryEnterExistingAccount();
        if (entered) return;
        persistOnboardingPending(true);
        setPassedVerify(true);
        setStep("profile");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Sign in failed.";
        if (/confirm|not confirmed|verif/i.test(message)) {
          persistOnboardingPending(true);
          setInfo("Confirm your email with the code we sent, then continue.");
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
      setInfo(`If an account exists for ${email.trim()}, we sent a reset link.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setBusy(false);
    }
  };

  const skipOrgSetup = () => {
    setError("");
    persistOrgName(orgName.trim());
    persistOrgInviteDraft(invitesToPersist(orgInvites));
    if (!workspaceName.trim() && orgName.trim()) {
      setWorkspaceName(orgName.trim());
    }
    setStep("workspace");
  };

  const validateOrgInvites = (rows: OrgInviteDraft[]): string | null => {
    const self = email.trim().toLowerCase();
    if (!self) return null;
    for (const row of rows) {
      const inviteEmail = row.email.trim().toLowerCase();
      if (inviteEmail.includes("@") && inviteEmail === self) {
        return "You cannot invite yourself.";
      }
    }
    return null;
  };

  const goCreateNext = () => {
    if (step === "create") {
      void beginSignup();
      return;
    }
    if (step === "profile") {
      if (!shortName.trim()) {
        setError("Add a short name.");
        return;
      }
      setError("");
      setStep(nativeShell ? (SHOW_ONBOARDING_CONNECTORS ? "connectors" : "appearance") : "plan");
      return;
    }
    if (step === "plan") {
      if (!plan) {
        setError("Choose a plan to continue.");
        return;
      }
      setError("");
      if (plan === "free") {
        setStep("connectors");
        return;
      }
      if (plan === "pro" || plan === "max") {
        void startPaidCheckout(plan);
        return;
      }
      setStep("workspace");
      return;
    }
    if (step === "max-intent") {
      if (!maxIntent) {
        setError("Choose how you’ll use Max.");
        return;
      }
      setError("");
      if (maxIntent === "org-now") {
        setStep("org-setup");
        return;
      }
      if (maxIntent === "org-later") {
        if (!workspaceName.trim() && orgName.trim()) {
          setWorkspaceName(orgName.trim());
        }
      }
      setStep("workspace");
      return;
    }
    if (step === "org-setup") {
      if (!orgName.trim()) {
        setError("Add your organization name.");
        return;
      }
      const inviteError = validateOrgInvites(orgInvites);
      if (inviteError) {
        setError(inviteError);
        return;
      }
      setError("");
      persistOrgName(orgName.trim());
      persistOrgInviteDraft(invitesToPersist(orgInvites));
      if (!workspaceName.trim()) {
        setWorkspaceName(orgName.trim());
      }
      setStep("workspace");
      return;
    }
    if (step === "workspace") {
      if (!workspaceName.trim()) {
        setError("Name your first workspace.");
        return;
      }
      setError("");
      setStep("appearance");
      return;
    }
    if (step === "connectors") {
      setError("");
      setStep("appearance");
      return;
    }
    if (step === "appearance") {
      if (nativeShell) {
        setError("");
        setStep("hosting");
        return;
      }
      void applySetup();
      return;
    }
    if (step === "hosting") {
      void applySetup();
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
    if (step === "profile" && !passedVerify && usingSupabase) {
      setStep("verify");
      return;
    }
    if (step === "profile") {
      // Already have a session — don't send them back into Create account.
      if (usingSupabase && passedVerify) return;
      setStep("create");
      return;
    }
    if (step === "org-setup") {
      setStep("max-intent");
      return;
    }
    if (step === "max-intent") {
      setStep("plan");
      return;
    }
    if (step === "workspace") {
      if (plan === "max" && maxIntent === "org-now") {
        setStep("org-setup");
        return;
      }
      if (plan === "max") {
        setStep("max-intent");
        return;
      }
      if (plan === "pro") {
        setStep("plan");
        return;
      }
    }
    const idx = createSteps.indexOf(step);
    if (idx > 0) setStep(createSteps[idx - 1]);
  };

  const showBack =
    step !== "welcome" &&
    !(usingSupabase && passedVerify && step === "profile");

  const panel = PANEL_COPY[step];
  const showAppearancePreview = step === "appearance";

  return (
    <AppearanceScope
      syncSideEffects
      className="flex h-svh w-full flex-col overflow-hidden bg-background text-foreground lg:flex-row"
    >
      {/* Left: auth / onboarding — 50% on desktop; clears traffic lights on Mac. */}
      <div className="relative flex min-h-0 w-full flex-1 flex-col pt-[var(--desktop-titlebar)] lg:w-1/2 lg:flex-none">
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto px-6 sm:px-10",
            mobile ? "pt-[calc(env(safe-area-inset-top,0px)+50px)] pb-36" : "pt-8 sm:pt-10 pb-10",
          )}
        >
          <div className="mx-auto w-full max-w-[26rem]">
            {/* Fixed-height back row — same top edge on every step. */}
            <div className="mb-8 flex h-9 items-center">
              {showBack ? (
                <button
                  type="button"
                  onClick={goBack}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 border border-border bg-background px-3 text-[13px] font-medium tracking-[-0.01em] text-foreground transition-colors duration-200 hover:bg-muted rounded-[10px]",
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
                  resetAppearance();
                  setStep("create");
                }}
                error={error}
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
                onSubmit={() => void confirmVerify()}
                onResend={() => void resendVerify()}
              />
            ) : null}

            {step === "profile" ? (
              <ProfileStep
                shortName={shortName}
                error={error}
                onShortName={(value) => {
                  setShortName(value);
                  setError("");
                }}
                onSubmit={goCreateNext}
              />
            ) : null}

            {step === "plan" ? (
              <PlanStep
                plan={plan}
                error={error}
                info={info}
                onPlan={(value) => {
                  setPlan(value);
                  setError("");
                  setInfo("");
                }}
                onSubmit={goCreateNext}
              />
            ) : null}

            {step === "max-intent" ? (
              <MaxIntentStep
                intent={maxIntent}
                error={error}
                onIntent={(value) => {
                  setMaxIntent(value);
                  setError("");
                }}
                onSubmit={goCreateNext}
              />
            ) : null}

            {step === "org-setup" ? (
              <OrgSetupStep
                orgName={orgName}
                invites={orgInvites}
                ownerEmail={email}
                error={error}
                onOrgName={(value) => {
                  setOrgName(value);
                  setError("");
                }}
                onInvites={(value) => {
                  setOrgInvites(value);
                  setError("");
                }}
                onSubmit={goCreateNext}
                onSkip={skipOrgSetup}
                onValidationError={setError}
              />
            ) : null}

            {step === "workspace" ? (
              <WorkspaceStep
                workspaceName={workspaceName}
                error={error}
                onWorkspaceName={(value) => {
                  setWorkspaceName(value);
                  setError("");
                }}
                onSubmit={goCreateNext}
              />
            ) : null}

            {step === "connectors" && SHOW_ONBOARDING_CONNECTORS ? (
              <ConnectorsStep
                options={connectorOptions}
                selected={selectedConnectors}
                busy={busy}
                error={error}
                onToggle={(id) => {
                  setSelectedConnectors((current) =>
                    current.includes(id)
                      ? current.filter((item) => item !== id)
                      : [...current, id],
                  );
                }}
                onSubmit={goCreateNext}
                onSkip={() => {
                  setSelectedConnectors([]);
                  setError("");
                  setStep("appearance");
                }}
              />
            ) : null}

            {step === "appearance" ? (
              <AppearanceStep
                busy={busy}
                error={error}
                submitLabel={nativeShell ? "Continue" : "Enter Cander"}
                onSubmit={goCreateNext}
              />
            ) : null}

            {step === "hosting" ? (
              <HostingStep
                busy={busy}
                error={error}
                onSubmit={goCreateNext}
              />
            ) : null}
          </div>
        </div>
      </div>

      {mobile && step !== "plan" && step !== "appearance" && step !== "hosting" ? (
        <OnboardingMobilePanel step={step} />
      ) : null}

      {/* Right: 15px inset on all sides; white logo top-right (both themes) */}
      <div className="hidden min-h-0 w-1/2 p-[15px] lg:block">
        <div
          className={cn(
            "relative h-full min-h-0 overflow-hidden border border-border",
            SHELL_G3_RADIUS,
          )}
          aria-hidden={!showAppearancePreview}
        >
          <CanderMark
            tone="white"
            className="absolute top-[30px] right-[35px] z-20 h-7 w-7"
          />
          {showAppearancePreview ? (
            <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-black/30 to-black/55">
              <div className="absolute inset-0 panel-wash-price opacity-60" />
              <div className="panel-grain opacity-40" />
              <OnboardingAppPreview />
            </div>
          ) : (
            <>
              <div className="absolute inset-0 panel-wash-price" />
              <div className="panel-grain" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
              <div className="absolute inset-x-0 bottom-0 p-10 xl:p-14">
                <p className="max-w-lg text-[1.75rem] font-medium tracking-[-0.03em] text-white xl:text-[2rem]">
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
            </>
          )}
        </div>
      </div>
    </AppearanceScope>
  );
}

function AppearanceStep({
  onSubmit,
  busy = false,
  error = "",
  submitLabel = "Enter Cander",
}: {
  onSubmit: () => void;
  busy?: boolean;
  error?: string;
  submitLabel?: string;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Make it yours
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Pick a color mode. The preview on the right updates as you go — continue
        when it feels right.
      </p>
      <div className="mt-8">
        <AppearanceControls compact />
      </div>
      {error ? (
        <p className="mt-4 text-[12.5px] text-destructive">{error}</p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={onSubmit}
        className={cn("mt-8 inline-flex items-center gap-2", primaryBtnClass)}
      >
        {submitLabel}
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : null}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          resetAppearance();
        }}
        className={cn("mt-2", ghostBtnClass)}
      >
        Reset defaults
      </button>
    </>
  );
}

function HostingStep({
  onSubmit,
  busy = false,
  error = "",
}: {
  onSubmit: () => void;
  busy?: boolean;
  error?: string;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Where should AI run?
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Cloud always works. On device uses Apple Intelligence on this phone when
        available. Auto prefers on-device, then falls back to Cloud. You can
        change this later in Settings → Hosting.
      </p>
      <div className="mt-8">
        <HostingModePicker />
      </div>
      {error ? (
        <p className="mt-4 text-[12.5px] text-destructive">{error}</p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={onSubmit}
        className={cn("mt-8 inline-flex items-center gap-2", primaryBtnClass)}
      >
        Enter Cander
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : null}
      </button>
    </>
  );
}

function WelcomeStep({
  onSignIn,
  onCreate,
  error,
}: {
  onSignIn: () => void;
  onCreate: () => void;
  error?: string;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Welcome
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Sign in to your account, or create one to get started.
      </p>
      <div className="mt-8 space-y-2.5">
        <button
          type="button"
          onClick={onSignIn}
          className={primaryBtnClass}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={onCreate}
          className={secondaryBtnClass}
        >
          Create account
        </button>
      </div>
      {error ? (
        <p className="mt-4 text-[12.5px] text-destructive">{error}</p>
      ) : null}
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
}: {
  email: string;
  password: string;
  error: string;
  busy?: boolean;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: () => void;
  onForgot?: () => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Sign in
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Use the email and password for your Cander account.
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
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Create account
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Basics first. Next we&apos;ll confirm your email, then finish setup.
      </p>
      <form
        className="mt-8 space-y-3"
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
  onSubmit: () => void;
  onResend: () => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Check your email
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Enter the 6-digit code we sent. Wrong address? Update the email and
        resend.
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
            onComplete={() => onSubmit()}
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

function ProfileStep({
  shortName,
  error,
  onShortName,
  onSubmit,
}: {
  shortName: string;
  error: string;
  onShortName: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        What should we call you?
      </h1>
      <p className="mt-3 pl-0.5 text-[14.5px] leading-relaxed text-muted-foreground">
        For greetings and short replies. Edit in Settings.
      </p>
      <form
        className="mt-8 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          value={shortName}
          onChange={(event) => onShortName(event.target.value)}
          placeholder="Your name"
          aria-label="What should we call you?"
          autoComplete="nickname"
          className={inputClass}
        />
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
        <button
          type="submit"
          className={primaryBtnClass}
        >
          Continue
        </button>
      </form>
    </>
  );
}

function WorkspaceStep({
  workspaceName,
  error,
  onWorkspaceName,
  onSubmit,
}: {
  workspaceName: string;
  error: string;
  onWorkspaceName: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        First workspace
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Name the workspace you’ll land in.
      </p>
      <form
        className="mt-8 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          value={workspaceName}
          onChange={(event) => onWorkspaceName(event.target.value)}
          placeholder="Company"
          aria-label="First workspace"
          autoComplete="organization"
          autoFocus
          className={inputClass}
        />
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
        <button
          type="submit"
          className={primaryBtnClass}
        >
          Continue
        </button>
      </form>
    </>
  );
}

function PlanStep({
  plan,
  error,
  info = "",
  onPlan,
  onSubmit,
}: {
  plan: BillingPlan | null;
  error: string;
  info?: string;
  onPlan: (value: BillingPlan) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Choose a plan
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Pick Free, Pro, or Max to continue. Until billing is connected, Pro and
        Max unlock for testing without a charge.
      </p>
      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="grid gap-2">
          {PLANS.map((item) => {
            const active = plan === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onPlan(item.id)}
                className={cn(
                  "flex min-h-[4.5rem] flex-col justify-center border px-3.5 py-3 text-left transition-colors duration-200",
                  SHELL_G3_RADIUS,
                  active
                    ? onboardingSelectorActiveClass
                    : onboardingSelectorIdleClass,
                )}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] font-medium tracking-[-0.01em]">
                    {item.title}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
                    {item.price}
                  </span>
                </span>
                <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                  {item.body}
                </span>
              </button>
            );
          })}
        </div>
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
        {info ? (
          <p className="text-[12.5px] text-muted-foreground">{info}</p>
        ) : null}
        <button
          type="submit"
          className={primaryBtnClass}
        >
          Continue
        </button>
      </form>
    </>
  );
}

const MAX_INTENT_OPTIONS: {
  id: MaxIntent;
  title: string;
  body: string;
}[] = [
  {
    id: "personal",
    title: "Personal",
    body: "Max for one person — your workspaces, your pace.",
  },
  {
    id: "org-now",
    title: "Set up organization",
    body: "Company signup — invite Pro or Max teammates now.",
  },
  {
    id: "org-later",
    title: "Set up later",
    body: "Use Max now; finish org setup anytime in Settings.",
  },
];

function MaxIntentStep({
  intent,
  error,
  onIntent,
  onSubmit,
}: {
  intent: MaxIntent | null;
  error: string;
  onIntent: (value: MaxIntent) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        How will you use Max?
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Personal power or a team organization — you can change this later.
      </p>
      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="grid gap-2">
          {MAX_INTENT_OPTIONS.map((item) => {
            const active = intent === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onIntent(item.id)}
                className={cn(
                  "flex min-h-[4.5rem] flex-col justify-center border px-3.5 py-3 text-left transition-colors duration-200",
                  SHELL_G3_RADIUS,
                  active
                    ? onboardingSelectorActiveClass
                    : onboardingSelectorIdleClass,
                )}
              >
                <span className="text-[13.5px] font-medium tracking-[-0.01em]">
                  {item.title}
                </span>
                <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                  {item.body}
                </span>
              </button>
            );
          })}
        </div>
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
        <button type="submit" className={primaryBtnClass}>
          Continue
        </button>
      </form>
    </>
  );
}

function PlanSeatToggle({
  value,
  onChange,
  label,
}: {
  value: OrgInviteDraft["plan"];
  onChange: (value: OrgInviteDraft["plan"]) => void;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label ?? "Seat plan"}
      className={cn(
        "inline-flex h-9 shrink-0 border border-border bg-muted/50 p-0.5",
        SHELL_G3_RADIUS,
      )}
    >
      {(["pro", "max"] as const).map((plan) => (
        <button
          key={plan}
          type="button"
          aria-pressed={value === plan}
          onClick={() => onChange(plan)}
          className={cn(
            "inline-flex h-full min-w-[3.5rem] items-center justify-center px-3.5 text-[12.5px] font-medium tracking-[-0.01em] transition-colors duration-200",
            SHELL_G3_RADIUS,
            value === plan
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {plan === "pro" ? "Pro" : "Max"}
        </button>
      ))}
    </div>
  );
}

function OrgSetupStep({
  orgName,
  invites,
  ownerEmail,
  error,
  onOrgName,
  onInvites,
  onSubmit,
  onSkip,
  onValidationError,
}: {
  orgName: string;
  invites: OrgInviteDraft[];
  ownerEmail: string;
  error: string;
  onOrgName: (value: string) => void;
  onInvites: (value: OrgInviteDraft[]) => void;
  onSubmit: () => void;
  onSkip: () => void;
  onValidationError: (message: string) => void;
}) {
  const rows = invites.length ? invites : [emptyOrgInvite()];
  const validInvites = validInviteRows(rows);

  const updateRow = (index: number, patch: Partial<OrgInviteDraft>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onInvites(next);
  };

  const addRow = () => {
    onInvites([...rows, emptyOrgInvite()]);
  };

  const removeRow = (index: number) => {
    onInvites(rows.filter((_, i) => i !== index));
  };

  const validate = (): string | null => {
    const self = ownerEmail.trim().toLowerCase();
    if (!self) return null;
    for (const row of rows) {
      const inviteEmail = row.email.trim().toLowerCase();
      if (inviteEmail.includes("@") && inviteEmail === self) {
        return "You cannot invite yourself.";
      }
    }
    return null;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const message = validate();
    if (message) {
      onValidationError(message);
      return;
    }
    onInvites(invitesToPersist(rows));
    onSubmit();
  };

  const primaryLabel = validInvites.length
    ? "Save teammates & continue"
    : "Continue";

  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Set up your organization
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Invite Pro or Max teammates now, or add people later in Settings.
      </p>
      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-[12.5px] font-medium tracking-[-0.01em] text-muted-foreground">
            Organization name
          </label>
          <input
            value={orgName}
            onChange={(event) => onOrgName(event.target.value)}
            placeholder="Company"
            aria-label="Organization name"
            autoComplete="organization"
            autoFocus
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label className="text-[12.5px] font-medium tracking-[-0.01em] text-muted-foreground">
            Invite teammates (optional)
          </label>
          <div className="max-h-[min(280px,38vh)] space-y-2.5 overflow-y-auto pr-0.5">
            {rows.map((row, index) => (
              <div
                key={index}
                className={cn(
                  "space-y-2 border border-border bg-background/60 p-3",
                  SHELL_G3_RADIUS,
                )}
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={row.firstName}
                    onChange={(event) =>
                      updateRow(index, { firstName: event.target.value })
                    }
                    placeholder="First name"
                    aria-label={`First name ${index + 1}`}
                    autoComplete="given-name"
                    className={inputClass}
                  />
                  <input
                    value={row.lastName}
                    onChange={(event) =>
                      updateRow(index, { lastName: event.target.value })
                    }
                    placeholder="Last name"
                    aria-label={`Last name ${index + 1}`}
                    autoComplete="family-name"
                    className={inputClass}
                  />
                </div>
                <input
                  value={row.email}
                  onChange={(event) =>
                    updateRow(index, { email: event.target.value })
                  }
                  placeholder="name@company.com"
                  aria-label={`Email ${index + 1}`}
                  autoComplete="email"
                  className={inputClass}
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] text-muted-foreground">Plan</span>
                  <div className="flex items-center gap-2">
                    <PlanSeatToggle
                      value={row.plan}
                      onChange={(plan) => updateRow(index, { plan })}
                      label={`Seat plan ${index + 1}`}
                    />
                    {rows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        className="text-[12.5px] text-muted-foreground hover:text-foreground"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addRow}
            className={cn(
              "mt-1 inline-flex h-9 w-full items-center justify-center border border-dashed border-foreground/15 text-[13px] font-medium tracking-[-0.01em] text-muted-foreground hover:border-foreground/25 hover:text-foreground",
              SHELL_G3_RADIUS,
            )}
          >
            Add another
          </button>
        </div>

        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
        <div className="space-y-2.5">
          <button type="submit" className={primaryBtnClass}>
            {primaryLabel}
          </button>
          <button type="button" onClick={onSkip} className={secondaryBtnClass}>
            Skip for now
          </button>
          <p className="text-center text-[12px] leading-relaxed text-muted-foreground">
            Invites are created in your org. Email is sent when Resend is
            configured; otherwise you’ll get shareable invite links after setup.
            Nothing is charged during signup until billing is connected.
          </p>
        </div>
      </form>
    </>
  );
}

function ConnectorsStep({
  options,
  selected,
  busy = false,
  error = "",
  onToggle,
  onSubmit,
  onSkip,
}: {
  options: (typeof connectors)[number][];
  selected: string[];
  busy?: boolean;
  error?: string;
  onToggle: (id: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Apps you’ll use
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Mark what you care about. Nothing is connected yet — you’ll authorize
        apps later from Connectors.
      </p>
      <div className="mt-8 grid gap-2">
        {options.map((item) => {
          const active = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              disabled={busy}
              onClick={() => onToggle(item.id)}
              className={cn(
                "flex items-start gap-3 border px-3.5 py-3 text-left transition-colors duration-200",
                SHELL_G3_RADIUS,
                active
                  ? "border-foreground/25 bg-muted"
                  : "border-border hover:border-foreground/20 hover:bg-muted/40",
                busy && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border",
                )}
              >
                {active ? <Check className="h-3 w-3" strokeWidth={2.4} /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium tracking-[-0.01em]">
                  {item.name}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="mt-4 text-[12.5px] leading-relaxed text-destructive">{error}</p>
      ) : null}
      <div className="mt-6 space-y-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={onSubmit}
          className={primaryBtnClass}
        >
          {busy ? "Creating account…" : "Continue"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onSkip}
          className={ghostBtnClass}
        >
          Skip for now
        </button>
      </div>
    </>
  );
}

const inputClass = cn(
  "h-11 w-full border border-border bg-input px-3.5 text-[14px] outline-none focus:border-foreground/20",
  SHELL_G3_RADIUS,
);

const primaryBtnClass = cn(
  "inline-flex h-11 w-full items-center justify-center bg-primary text-[14px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground disabled:opacity-50",
  SHELL_G3_RADIUS,
);

const secondaryBtnClass = cn(
  "inline-flex h-11 w-full items-center justify-center border border-foreground/15 text-[14px] font-medium tracking-[-0.01em] hover:bg-muted disabled:opacity-50",
  SHELL_G3_RADIUS,
);

const ghostBtnClass = cn(
  "inline-flex h-10 w-full items-center justify-center text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60",
  SHELL_G3_RADIUS,
);

const onboardingSelectorActiveClass =
  "border-foreground bg-muted ring-2 ring-foreground/15 shadow-sm";
const onboardingSelectorIdleClass =
  "border-border hover:border-foreground/25 hover:bg-muted/40";

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
