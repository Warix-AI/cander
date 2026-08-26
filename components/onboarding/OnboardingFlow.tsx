"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { CourierMark } from "@/components/brand/CourierMark";
import { useApp } from "@/components/app/AppProvider";
import { connectors } from "@/lib/data";
import { installConnector } from "@/lib/connector-install";
import {
  getAuthServerSnapshot,
  getAuthSnapshot,
  persistSignedIn,
  persistWorkspace,
  subscribeAuth,
} from "@/lib/session";
import { AppearanceControls } from "@/components/settings/AppearanceControls";
import { OnboardingCourierPreview } from "@/components/onboarding/OnboardingCourierPreview";
import { AppearanceScope } from "@/components/theme/AppearanceProvider";
import { resetAppearance } from "@/lib/appearance";
import type { AccountPresetId, BillingPlan, UltraSeatKind } from "@/lib/types";
import { createWorkspace } from "@/lib/workspace-catalog";
import { addUltraLicense } from "@/lib/ultra-licenses";
import { cn } from "@/lib/utils";

const demoEmail = "matthew@acme.com";
const demoPassword = "courier";

function presetForPlan(plan: BillingPlan): AccountPresetId {
  if (plan === "free") return "free";
  if (plan === "pro") return "pro";
  if (plan === "ultra") return "ultra";
  return "max-owner";
}

type Step =
  | "welcome"
  | "sign-in"
  | "create"
  | "profile"
  | "workspace"
  | "plan"
  | "ultra-seat"
  | "appearance"
  | "connectors";

function createStepsFor(plan: BillingPlan): Step[] {
  const steps: Step[] = ["create", "profile", "workspace", "plan"];
  if (plan === "ultra") steps.push("ultra-seat");
  steps.push("appearance", "connectors");
  return steps;
}

const ONBOARDING_CONNECTORS = ["gmail", "slack", "gcal", "notion", "github", "linear"];

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
    body: "New Chat, Work, Build, Explore, Connectors, and Recents.",
  },
  {
    id: "pro",
    title: "Pro",
    price: "$20/mo",
    body: "Full product for individuals — voice, workspaces, local.",
  },
  {
    id: "max",
    title: "Max",
    price: "$50/mo",
    body: "Teams and power users. Shared workspaces and hosting.",
  },
  {
    id: "ultra",
    title: "Ultra",
    price: "$300/mo",
    body: "One production machine license per seat — add more Ultra seats for more machines.",
  },
];

const PANEL_COPY: Record<
  Step,
  { title: string; body: string }
> = {
  welcome: {
    title: "Operate, build, and explore — one place to get work done.",
    body: "Connect apps, run automations, and keep every workspace in sync.",
  },
  "sign-in": {
    title: "Pick up where Matthew left off.",
    body: "This prototype signs you into the Acme Max Owner account we’ve been building.",
  },
  create: {
    title: "Create an account, then finish setup.",
    body: "We’ll walk through profile, workspace, plan, appearance, and connectors — then open the app on the plan you pick.",
  },
  profile: {
    title: "It should sound like it knows you.",
    body: "A short name keeps replies personal without cluttering every thread.",
  },
  workspace: {
    title: "Start with the right kind of home.",
    body: "Personal or business — same Work, Build, and Explore layout either way.",
  },
  plan: {
    title: "Choose the depth you need.",
    body: "Plans unlock hosting, models, and team seats. The prototype still lands on Matthew’s Max account.",
  },
  "ultra-seat": {
    title: "Who is this Ultra seat for?",
    body: "Each Ultra seat licenses one production machine. Attach it to a person, or keep it as a machine-only seat you manage.",
  },
  appearance: {
    title: "Make it feel like yours.",
    body: "Pick a color mode and layout — watch the preview update as you go.",
  },
  connectors: {
    title: "Wire up the apps you already live in.",
    body: "Gmail, Slack, calendar, docs — connect a few now. Add more anytime from Connectors in the sidebar.",
  },
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
  if (signedIn) return null;
  return <OnboardingShell />;
}

function OnboardingShell() {
  const { setPreview, setWorkspace } = useApp();
  const [step, setStep] = useState<Step>("welcome");
  const [email, setEmail] = useState(demoEmail);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("Matthew Gross");
  const [shortName, setShortName] = useState("Matt");
  const [workspaceKind, setWorkspaceKind] = useState<"personal" | "business">(
    "business",
  );
  const [workspaceName, setWorkspaceName] = useState("Acme Inc.");
  const [plan, setPlan] = useState<BillingPlan>("max");
  const [ultraSeatKind, setUltraSeatKind] = useState<UltraSeatKind>("user");
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([
    "gmail",
    "slack",
    "gcal",
  ]);
  const [error, setError] = useState("");

  const createSteps = useMemo(() => createStepsFor(plan), [plan]);
  const createIndex = createSteps.indexOf(step);
  const createProgress =
    createIndex >= 0 ? `${createIndex + 1} / ${createSteps.length}` : null;

  const connectorOptions = useMemo(
    () =>
      ONBOARDING_CONNECTORS.map((id) => connectors.find((item) => item.id === id)).filter(
        (item): item is (typeof connectors)[number] => Boolean(item),
      ),
    [],
  );

  const enterWithPlan = (chosen: BillingPlan = "max") => {
    setPreview(presetForPlan(chosen));
    persistSignedIn();
  };

  const applySetup = () => {
    for (const id of selectedConnectors) {
      installConnector(id);
    }
    const created = createWorkspace({
      name: workspaceName.trim() || (workspaceKind === "personal" ? "Personal" : "Acme"),
      kind: workspaceKind,
    });
    if (created) {
      persistWorkspace(created.id);
      setWorkspace(created.id);
    }
    if (plan === "ultra") {
      addUltraLicense({
        kind: ultraSeatKind,
        scope: workspaceKind === "business" ? "org" : "personal",
        userId: ultraSeatKind === "user" ? "self" : null,
        label:
          ultraSeatKind === "machine" ? "Production machine 1" : undefined,
      });
    }
    enterWithPlan(plan);
  };

  const signIn = () => {
    if (email.trim().toLowerCase() !== demoEmail) {
      setError(`Use ${demoEmail} for this prototype.`);
      return;
    }
    if (password && password !== demoPassword) {
      setError(`Prototype password is "${demoPassword}".`);
      return;
    }
    setError("");
    enterWithPlan("max");
  };

  const goCreateNext = () => {
    if (step === "create") {
      if (!name.trim()) {
        setError("Add your name to continue.");
        return;
      }
      if (!email.trim().includes("@")) {
        setError("Enter a valid email.");
        return;
      }
      setError("");
      if (!shortName.trim()) {
        setShortName(name.trim().split(/\s+/)[0] || "Matt");
      }
      setStep("profile");
      return;
    }
    if (step === "profile") {
      if (!shortName.trim()) {
        setError("Add a short name.");
        return;
      }
      setError("");
      setStep("workspace");
      return;
    }
    if (step === "workspace") {
      if (!workspaceName.trim()) {
        setError("Name your first workspace.");
        return;
      }
      setError("");
      setStep("plan");
      return;
    }
    if (step === "plan") {
      setError("");
      setStep(plan === "ultra" ? "ultra-seat" : "appearance");
      return;
    }
    if (step === "ultra-seat") {
      setError("");
      setStep("appearance");
      return;
    }
    if (step === "appearance") {
      setError("");
      setStep("connectors");
      return;
    }
    if (step === "connectors") {
      applySetup();
    }
  };

  const goBack = () => {
    setError("");
    if (step === "sign-in" || step === "create") {
      setStep("welcome");
      return;
    }
    const idx = createSteps.indexOf(step);
    if (idx > 0) setStep(createSteps[idx - 1]);
  };

  const panel = PANEL_COPY[step];
  const showAppearancePreview = step === "appearance";

  return (
    <AppearanceScope
      className="flex h-svh w-full flex-col overflow-hidden bg-background text-foreground lg:flex-row"
    >
      {/* Left: auth / onboarding — 50% on desktop; clears traffic lights on Mac. */}
      <div className="relative flex min-h-0 w-full flex-1 flex-col pt-[var(--desktop-titlebar)] lg:w-1/2 lg:flex-none">
        <div className="flex items-center justify-end gap-3 px-6 pt-6 sm:px-10">
          {createProgress ? (
            <p className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
              {createProgress}
            </p>
          ) : (
            <span className="h-7" aria-hidden />
          )}
        </div>

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-10 sm:px-10",
            showAppearancePreview ? "justify-start" : "justify-center",
          )}
        >
          <div
            className={cn(
              "mx-auto w-full",
              showAppearancePreview ? "max-w-[28rem]" : "max-w-[26rem]",
            )}
          >
            {step !== "welcome" ? (
              <button
                type="button"
                onClick={goBack}
                className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.7} />
                Back
              </button>
            ) : null}

            {step === "welcome" ? (
              <WelcomeStep
                onSignIn={() => {
                  setError("");
                  setStep("sign-in");
                }}
                onCreate={() => {
                  setError("");
                  resetAppearance();
                  setStep("create");
                }}
              />
            ) : null}

            {step === "sign-in" ? (
              <SignInStep
                email={email}
                password={password}
                error={error}
                onEmail={(value) => {
                  setEmail(value);
                  setError("");
                }}
                onPassword={(value) => {
                  setPassword(value);
                  setError("");
                }}
                onSubmit={signIn}
              />
            ) : null}

            {step === "create" ? (
              <CreateStep
                name={name}
                email={email}
                password={password}
                error={error}
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

            {step === "workspace" ? (
              <WorkspaceStep
                workspaceKind={workspaceKind}
                workspaceName={workspaceName}
                error={error}
                onWorkspaceKind={(value) => {
                  setWorkspaceKind(value);
                  setWorkspaceName(
                    value === "personal" ? "Personal" : "Acme Inc.",
                  );
                  setError("");
                }}
                onWorkspaceName={(value) => {
                  setWorkspaceName(value);
                  setError("");
                }}
                onSubmit={goCreateNext}
              />
            ) : null}

            {step === "plan" ? (
              <PlanStep plan={plan} onPlan={setPlan} onSubmit={goCreateNext} />
            ) : null}

            {step === "ultra-seat" ? (
              <UltraSeatStep
                kind={ultraSeatKind}
                onKind={setUltraSeatKind}
                onSubmit={goCreateNext}
              />
            ) : null}

            {step === "appearance" ? (
              <AppearanceStep onSubmit={goCreateNext} />
            ) : null}

            {step === "connectors" ? (
              <ConnectorsStep
                options={connectorOptions}
                selected={selectedConnectors}
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
                  applySetup();
                }}
              />
            ) : null}
          </div>
        </div>

        <div className="px-6 pb-6 sm:px-10">
          <Link
            href="/home"
            className="text-[12.5px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            Back to marketing site
          </Link>
        </div>
      </div>

      {/* Right: panel flush to the top edge; logo top-right */}
      <div className="hidden min-h-0 w-1/2 pr-[15px] pb-[15px] pl-[15px] lg:block">
        <div
          className={cn(
            "relative h-full min-h-0 overflow-hidden rounded-[18px] border border-border",
          )}
          aria-hidden={!showAppearancePreview}
        >
          <CourierMark className="absolute top-6 right-6 z-20 h-7 w-7" />
          {showAppearancePreview ? (
            <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-black/30 to-black/55">
              <div className="absolute inset-0 panel-wash-price opacity-60" />
              <div className="panel-grain opacity-40" />
              <OnboardingCourierPreview />
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
                <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-white/75">
                  {panel.body}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </AppearanceScope>
  );
}

function AppearanceStep({ onSubmit }: { onSubmit: () => void }) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Make it yours
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Pick a color mode and layout. The preview on the right updates as you
        go — continue when it feels right.
      </p>
      <div className="mt-8">
        <AppearanceControls compact />
      </div>
      <button
        type="button"
        onClick={onSubmit}
        className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[14px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground"
      >
        Continue
      </button>
      <button
        type="button"
        onClick={() => {
          resetAppearance();
        }}
        className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-full text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Reset defaults
      </button>
    </>
  );
}

function WelcomeStep({
  onSignIn,
  onCreate,
}: {
  onSignIn: () => void;
  onCreate: () => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Welcome
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Sign in as Matthew, or create an account to walk through setup. Either
        path continues in Matt&apos;s Max Owner workspace.
      </p>
      <div className="mt-8 space-y-2.5">
        <button
          type="button"
          onClick={onSignIn}
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[14px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground"
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-11 w-full items-center justify-center rounded-full border border-foreground/15 text-[14px] font-medium tracking-[-0.01em] hover:bg-muted"
        >
          Create account
        </button>
      </div>
    </>
  );
}

function SignInStep({
  email,
  password,
  error,
  onEmail,
  onPassword,
  onSubmit,
}: {
  email: string;
  password: string;
  error: string;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Sign in
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Use Matthew&apos;s demo credentials. This prototype only opens the Max
        Owner account.
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
            className={inputClass}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(event) => onPassword(event.target.value)}
            placeholder={demoPassword}
            autoComplete="current-password"
            className={inputClass}
          />
        </Field>
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[14px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground"
        >
          Continue as Matthew
        </button>
      </form>

      <div className="mt-6 rounded-[10px] border border-border bg-card p-3.5">
        <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
          Demo login
        </p>
        <p className="mt-2 font-mono text-[12.5px] leading-relaxed">
          {demoEmail}
          <br />
          {demoPassword}
        </p>
      </div>
    </>
  );
}

function CreateStep({
  name,
  email,
  password,
  error,
  onName,
  onEmail,
  onPassword,
  onSubmit,
}: {
  name: string;
  email: string;
  password: string;
  error: string;
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
        Basics first. Next we&apos;ll set profile, workspace, plan, and
        connectors.
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
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[14px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground"
        >
          Continue
        </button>
      </form>
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
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Used in greetings and short replies. You can change this later in
        Settings.
      </p>
      <form
        className="mt-8 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Field label="Short name">
          <input
            value={shortName}
            onChange={(event) => onShortName(event.target.value)}
            placeholder="Matt"
            className={inputClass}
          />
        </Field>
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[14px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground"
        >
          Continue
        </button>
      </form>
    </>
  );
}

function WorkspaceStep({
  workspaceKind,
  workspaceName,
  error,
  onWorkspaceKind,
  onWorkspaceName,
  onSubmit,
}: {
  workspaceKind: "personal" | "business";
  workspaceName: string;
  error: string;
  onWorkspaceKind: (value: "personal" | "business") => void;
  onWorkspaceName: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        First workspace
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Choose personal or business, then name the workspace you&apos;ll land
        in.
      </p>
      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="grid gap-2">
          {(
            [
              {
                id: "personal" as const,
                title: "Personal",
                body: "For your own chats, files, and side projects.",
              },
              {
                id: "business" as const,
                title: "Business",
                body: "For a team with company email — Work, Build, Explore, and shared connectors.",
              },
            ] as const
          ).map((item) => {
            const active = workspaceKind === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onWorkspaceKind(item.id)}
                className={cn(
                  "rounded-[10px] border px-3.5 py-3 text-left transition-colors duration-200",
                  active
                    ? "border-foreground/25 bg-muted"
                    : "border-border hover:border-foreground/20 hover:bg-muted/40",
                )}
              >
                <span className="block text-[13.5px] font-medium tracking-[-0.01em]">
                  {item.title}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted-foreground">
                  {item.body}
                </span>
              </button>
            );
          })}
        </div>
        <Field
          label={
            workspaceKind === "personal" ? "Workspace name" : "Company / workspace"
          }
        >
          <input
            value={workspaceName}
            onChange={(event) => onWorkspaceName(event.target.value)}
            className={inputClass}
          />
        </Field>
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[14px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground"
        >
          Continue
        </button>
      </form>
    </>
  );
}

function PlanStep({
  plan,
  onPlan,
  onSubmit,
}: {
  plan: BillingPlan;
  onPlan: (value: BillingPlan) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Choose a plan
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Your choice sets the demo seat you enter on — Free, Pro, Max, or Ultra.
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
                  "rounded-[10px] border px-3.5 py-3 text-left transition-colors duration-200",
                  active
                    ? "border-foreground/25 bg-muted"
                    : "border-border hover:border-foreground/20 hover:bg-muted/40",
                )}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] font-medium tracking-[-0.01em]">
                    {item.title}
                  </span>
                  <span className="font-mono text-[12px] text-muted-foreground">
                    {item.price}
                  </span>
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted-foreground">
                  {item.body}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[14px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground"
        >
          Continue
        </button>
      </form>
    </>
  );
}

function UltraSeatStep({
  kind,
  onKind,
  onSubmit,
}: {
  kind: UltraSeatKind;
  onKind: (value: UltraSeatKind) => void;
  onSubmit: () => void;
}) {
  const options: {
    id: UltraSeatKind;
    title: string;
    body: string;
  }[] = [
    {
      id: "user",
      title: "A person will use it",
      body: "Normal Ultra user. They get their own seat and can add a production machine on the network.",
    },
    {
      id: "machine",
      title: "Just a machine I’ll manage",
      body: "No separate login. This Ultra seat licenses another production machine under your account.",
    },
  ];

  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Ultra seat type
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Need three machines? That&apos;s three Ultra seats. Extra seats can stay
        machine-only — you manage them without inviting more people.
      </p>
      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="grid gap-2">
          {options.map((item) => {
            const active = kind === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onKind(item.id)}
                className={cn(
                  "rounded-[10px] border px-3.5 py-3 text-left transition-colors duration-200",
                  active
                    ? "border-foreground/25 bg-muted"
                    : "border-border hover:border-foreground/20 hover:bg-muted/40",
                )}
              >
                <span className="text-[13.5px] font-medium tracking-[-0.01em]">
                  {item.title}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted-foreground">
                  {item.body}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[14px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground"
        >
          Continue
        </button>
      </form>
    </>
  );
}

function ConnectorsStep({
  options,
  selected,
  onToggle,
  onSubmit,
  onSkip,
}: {
  options: (typeof connectors)[number][];
  selected: string[];
  onToggle: (id: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <h1 className="heading-display text-[1.85rem] tracking-[-0.03em]">
        Connect your apps
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
        Select what to wire up now. You can add or remove connectors anytime.
      </p>
      <div className="mt-8 grid gap-2">
        {options.map((item) => {
          const active = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={cn(
                "flex items-start gap-3 rounded-[10px] border px-3.5 py-3 text-left transition-colors duration-200",
                active
                  ? "border-foreground/25 bg-muted"
                  : "border-border hover:border-foreground/20 hover:bg-muted/40",
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
      <div className="mt-6 space-y-2.5">
        <button
          type="button"
          onClick={onSubmit}
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[14px] font-medium tracking-[-0.01em] text-primary-foreground hover:bg-foreground"
        >
          Get started
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex h-10 w-full items-center justify-center rounded-full text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Skip connectors
        </button>
      </div>
    </>
  );
}

const inputClass =
  "h-11 w-full rounded-[10px] border border-border bg-background px-3.5 text-[14px] outline-none focus:border-foreground/20";

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
