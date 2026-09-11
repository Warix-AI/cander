"use client";

import { useSyncExternalStore } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  clarificationBack,
  clarificationNext,
  cancelClarification,
  getActiveClarification,
  patchClarificationAnswers,
  submitClarification,
  subscribeClarificationStore,
} from "@/lib/ai/clarification/store";
import type {
  ClarificationCard as ClarificationCardModel,
  ClarificationQuestion,
  ClarificationSubmitResult,
} from "@/lib/ai/clarification/schema";
import {
  WEBSITE_SETUP_RESUME_TOOL,
  WEBSITE_SETUP_STEP_COUNT,
} from "@/lib/ai/build/website-setup-brief";
import { AI_CHOICE_VALUE } from "@/lib/ai/clarification/schema";
import {
  AiChooseButton,
  IdentityField,
  PaletteField,
  TypeSampleField,
  UrlsField,
  VisualChoiceField,
} from "@/components/chat/SetupVisualFields";
import { persistWebsiteSetupProgress } from "@/lib/ai/clarification/website-setup-ui";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

function QuestionField({
  question,
  value,
  error,
  onChange,
  ctx,
}: {
  question: ClarificationQuestion;
  value: unknown;
  error?: string;
  onChange: (next: unknown) => void;
  ctx?: { projectId?: string | null; workspaceId?: string | null; suggestedName?: string | null };
}) {
  const inputClass =
    "w-full rounded-[10px] border border-border bg-input px-3 py-2 text-[14px] outline-none focus:border-foreground/30";

  const heading = (
    <>
      <label className="text-[14px] font-medium leading-snug">{question.label}</label>
      {question.description ? (
        <p className="text-[12px] text-muted-foreground">{question.description}</p>
      ) : null}
    </>
  );
  const errorLine = error ? <p className="text-[12px] text-destructive">{error}</p> : null;
  const aiOn = value === AI_CHOICE_VALUE;
  const aiRow = question.aiChoice ? (
    <div className="flex items-center gap-2 pt-0.5">
      <AiChooseButton on={aiOn} onClick={() => onChange(aiOn ? undefined : AI_CHOICE_VALUE)} />
    </div>
  ) : null;

  switch (question.type) {
    case "visual_choice":
      return (
        <div className="flex flex-col gap-2">
          {heading}
          <VisualChoiceField question={question} value={aiOn ? undefined : value} onChange={onChange} />
          {aiRow}
          {errorLine}
        </div>
      );
    case "palette":
      return (
        <div className="flex flex-col gap-2">
          {heading}
          <PaletteField question={question} value={aiOn ? undefined : value} onChange={onChange} />
          {aiRow}
          {errorLine}
        </div>
      );
    case "type_sample":
      return (
        <div className="flex flex-col gap-2">
          {heading}
          <TypeSampleField question={question} value={aiOn ? undefined : value} onChange={onChange} />
          {aiRow}
          {errorLine}
        </div>
      );
    case "urls":
      return (
        <div className="flex flex-col gap-2">
          {heading}
          <UrlsField question={question} value={value} onChange={onChange} />
          {errorLine}
        </div>
      );
    case "upload":
      return (
        <div className="flex flex-col gap-2">
          {heading}
          <IdentityField
            question={question}
            value={aiOn ? undefined : value}
            onChange={onChange}
            projectId={ctx?.projectId}
            workspaceId={ctx?.workspaceId}
            suggestedName={ctx?.suggestedName}
          />
          {aiRow}
          {errorLine}
        </div>
      );
    case "textarea":
      return (
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium">{question.label}</label>
          {question.description ? (
            <p className="text-[12px] text-muted-foreground">
              {question.description}
            </p>
          ) : null}
          <textarea
            className={cn(inputClass, "min-h-[88px] resize-y")}
            placeholder={question.placeholder}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {error ? (
            <p className="text-[12px] text-destructive">{error}</p>
          ) : null}
        </div>
      );
    case "boolean":
      return (
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium">{question.label}</label>
          <div className="flex gap-2">
            {[true, false].map((opt) => (
              <button
                key={String(opt)}
                type="button"
                onClick={() => onChange(opt)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[13px]",
                  value === opt
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {opt ? "Yes" : "No"}
              </button>
            ))}
          </div>
          {error ? (
            <p className="text-[12px] text-destructive">{error}</p>
          ) : null}
        </div>
      );
    case "single_choice":
    case "select":
      return (
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium">{question.label}</label>
          {question.type === "select" ? (
            <select
              className={inputClass}
              value={typeof value === "string" ? value : ""}
              onChange={(e) => onChange(e.target.value)}
            >
              <option value="">Select…</option>
              {(question.choices ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(question.choices ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onChange(c.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[13px]",
                    value === c.id
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {error ? (
            <p className="text-[12px] text-destructive">{error}</p>
          ) : null}
        </div>
      );
    case "multi_choice": {
      const selected = Array.isArray(value) ? value.map(String) : [];
      return (
        <div className="flex flex-col gap-2">
          {heading}
          <div className="flex flex-wrap gap-2">
            {(question.choices ?? []).map((c) => {
              const on = !aiOn && selected.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange(
                      on
                        ? selected.filter((id) => id !== c.id)
                        : [...(aiOn ? [] : selected), c.id],
                    )
                  }
                  className={cn(
                    "inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-[13px] transition",
                    on
                      ? "bg-foreground text-background"
                      : "bg-muted text-foreground hover:bg-muted/70",
                  )}
                >
                  {on ? <Check className="h-3.5 w-3.5" strokeWidth={2.4} /> : null}
                  {c.label}
                  {c.hint ? <span className="text-[11px] opacity-70">· {c.hint}</span> : null}
                </button>
              );
            })}
          </div>
          {aiRow}
          {errorLine}
        </div>
      );
    }
    case "number":
      return (
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium">{question.label}</label>
          <input
            type="number"
            className={inputClass}
            value={value === undefined || value === null ? "" : String(value)}
            onChange={(e) =>
              onChange(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
          {error ? (
            <p className="text-[12px] text-destructive">{error}</p>
          ) : null}
        </div>
      );
    case "date":
    case "time":
    case "datetime":
      return (
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium">{question.label}</label>
          <input
            type={
              question.type === "datetime"
                ? "datetime-local"
                : question.type === "time"
                  ? "time"
                  : "date"
            }
            className={inputClass}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {error ? (
            <p className="text-[12px] text-destructive">{error}</p>
          ) : null}
        </div>
      );
    case "date_range": {
      const range =
        value && typeof value === "object"
          ? (value as { start?: string; end?: string })
          : {};
      return (
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium">{question.label}</label>
          <div className="flex gap-2">
            <input
              type="date"
              className={inputClass}
              value={range.start ?? ""}
              onChange={(e) =>
                onChange({ ...range, start: e.target.value })
              }
            />
            <input
              type="date"
              className={inputClass}
              value={range.end ?? ""}
              onChange={(e) => onChange({ ...range, end: e.target.value })}
            />
          </div>
          {error ? (
            <p className="text-[12px] text-destructive">{error}</p>
          ) : null}
        </div>
      );
    }
    case "attachment":
      return (
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium">{question.label}</label>
          <p className="text-[12px] text-muted-foreground">
            Use the composer paperclip to attach files for now, or type a note
            here.
          </p>
          <input
            className={inputClass}
            placeholder={question.placeholder ?? "Attachment note…"}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {error ? (
            <p className="text-[12px] text-destructive">{error}</p>
          ) : null}
        </div>
      );
    default:
      return (
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium">{question.label}</label>
          {question.description ? (
            <p className="text-[12px] text-muted-foreground">
              {question.description}
            </p>
          ) : null}
          <input
            className={inputClass}
            placeholder={question.placeholder}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {error ? (
            <p className="text-[12px] text-destructive">{error}</p>
          ) : null}
        </div>
      );
  }
}

function ClarificationCardView({
  card,
  onSubmitted,
  workspaceId,
}: {
  card: ClarificationCardModel;
  onSubmitted?: (result: ClarificationSubmitResult) => void;
  workspaceId?: string | null;
}) {
  const q = card.questions[card.stepIndex];
  const isLast = card.stepIndex >= card.questions.length - 1;
  const isFirst = card.stepIndex <= 0;
  const isWebsiteSetup = card.resumeTool === WEBSITE_SETUP_RESUME_TOOL;
  const projectId =
    typeof card.resumeArguments?.projectId === "string"
      ? card.resumeArguments.projectId
      : null;
  const suggestedName =
    typeof card.resumeArguments?.projectName === "string"
      ? card.resumeArguments.projectName
      : null;
  // Smart defaults: pre-select recommended options the first time a step shows.
  const currentValue =
    q && card.answers[q.id] === undefined && q.defaultValue !== undefined && !(q.id in card.answers)
      ? q.defaultValue
      : q
        ? card.answers[q.id]
        : undefined;
  const answeredCount = card.questions.filter(
    (question) => card.answers[question.id] !== undefined && card.answers[question.id] !== "",
  ).length;
  const stepCount = isWebsiteSetup ? WEBSITE_SETUP_STEP_COUNT : card.questions.length;

  /** Website setup: any unanswered step becomes “Cander decides”. */
  const finalizeWebsiteAnswers = (answers: Record<string, unknown>) => {
    const out: Record<string, unknown> = { ...answers };
    for (const question of card.questions) {
      const v = out[question.id];
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
        if (question.defaultValue !== undefined && !(question.id in out)) out[question.id] = question.defaultValue;
        else if (question.aiChoice) out[question.id] = AI_CHOICE_VALUE;
        else delete out[question.id];
      }
    }
    return out;
  };

  const syncWebsiteBrief = (answers: Record<string, unknown>) => {
    if (!isWebsiteSetup || !projectId || !workspaceId) return;
    void persistWebsiteSetupProgress({
      projectId,
      workspaceId,
      answers,
      status: "setup",
    });
  };

  return (
    <div
      className={cn(
        "cander-clarify-enter relative z-10 mb-[10px] border border-border bg-card shadow-sm dark:bg-card",
        SHELL_G3_RADIUS,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium tracking-[-0.01em]">
            {card.title}
          </h3>
          {card.description ? (
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {card.description}
            </p>
          ) : null}
          {card.questions.length > 1 ? (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex gap-1" aria-hidden>
                {card.questions.map((question, i) => (
                  <span
                    key={question.id}
                    className={cn(
                      "h-1 w-3 rounded-full transition-colors sm:w-4",
                      i === card.stepIndex
                        ? "bg-foreground"
                        : card.answers[question.id] !== undefined
                          ? "bg-foreground/50"
                          : "bg-foreground/15",
                    )}
                  />
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isWebsiteSetup
                  ? `Step ${card.stepIndex + 1} of ${stepCount} · ${answeredCount} answered`
                  : `${card.stepIndex + 1} of ${card.questions.length}`}
              </p>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => cancelClarification(card.threadId)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </div>

      <div className="max-h-[min(52vh,520px)] overflow-y-auto px-4 py-3">
        {q ? (
          <QuestionField
            question={q}
            value={currentValue}
            error={card.errors[q.id]}
            ctx={{ projectId, workspaceId, suggestedName }}
            onChange={(next) => {
              const patch = { [q.id]: next };
              patchClarificationAnswers(card.threadId, patch);
              syncWebsiteBrief({ ...card.answers, ...patch });
            }}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5">
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => clarificationBack(card.threadId)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12.5px] text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
          {!isLast ? (
            <button
              type="button"
              onClick={() => {
                if (clarificationNext(card.threadId)) {
                  syncWebsiteBrief(card.answers);
                }
              }}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12.5px] text-muted-foreground hover:bg-muted"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!isWebsiteSetup ? (
            <button
              type="button"
              onClick={() => {
                const result = submitClarification(card.threadId, {
                  skipRemaining: true,
                });
                if (result) onSubmitted?.(result);
              }}
              className="rounded-full px-2.5 py-1.5 text-[12.5px] text-muted-foreground hover:bg-muted"
            >
              Skip all
            </button>
          ) : (
            <>
              {!isLast ? (
                <button
                  type="button"
                  onClick={() => {
                    if (q) patchClarificationAnswers(card.threadId, { [q.id]: undefined });
                    if (clarificationNext(card.threadId)) syncWebsiteBrief(card.answers);
                  }}
                  className="min-h-[36px] rounded-full px-3 text-[12.5px] text-muted-foreground hover:bg-muted"
                >
                  Skip
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  const allAi: Record<string, unknown> = {};
                  for (const question of card.questions) {
                    if (question.aiChoice) allAi[question.id] = AI_CHOICE_VALUE;
                  }
                  const finalized = finalizeWebsiteAnswers({ ...card.answers, ...allAi });
                  patchClarificationAnswers(card.threadId, finalized);
                  const result = submitClarification(card.threadId);
                  if (result) {
                    if (projectId && workspaceId) {
                      void persistWebsiteSetupProgress({
                        projectId,
                        workspaceId,
                        answers: { ...result.answers, confirm_build: true },
                        status: "building",
                      });
                    }
                    onSubmitted?.(result);
                  }
                }}
                className="min-h-[36px] rounded-full border border-border px-3 text-[12.5px] font-medium text-foreground hover:bg-muted"
              >
                Let Candor decide
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              if (!isLast) {
                if (q && currentValue !== card.answers[q.id]) {
                  patchClarificationAnswers(card.threadId, { [q.id]: currentValue });
                }
                if (clarificationNext(card.threadId)) {
                  syncWebsiteBrief({ ...card.answers, ...(q ? { [q.id]: currentValue } : {}) });
                }
                return;
              }
              if (isWebsiteSetup) {
                const finalized = finalizeWebsiteAnswers(card.answers);
                patchClarificationAnswers(card.threadId, finalized);
              }
              const result = submitClarification(card.threadId);
              if (result) {
                if (isWebsiteSetup && projectId && workspaceId) {
                  void persistWebsiteSetupProgress({
                    projectId,
                    workspaceId,
                    answers: {
                      ...result.answers,
                      confirm_build: true,
                    },
                    status: "building",
                  });
                }
                onSubmitted?.(result);
              }
            }}
            className="min-h-[36px] rounded-full bg-foreground px-3.5 text-[12.5px] font-medium text-background"
          >
            {isLast
              ? isWebsiteSetup
                ? "Build my site"
                : "Submit"
              : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Composer-adjacent clarification card for the active thread. */
export function ClarificationCardSlot({
  threadId,
  workspaceId,
  onSubmitted,
}: {
  threadId: string | null | undefined;
  workspaceId?: string | null;
  onSubmitted?: (result: ClarificationSubmitResult) => void;
}) {
  const card = useSyncExternalStore(
    subscribeClarificationStore,
    () => getActiveClarification(threadId),
    () => null,
  );
  if (!card) return null;
  return (
    <ClarificationCardView
      card={card}
      workspaceId={workspaceId}
      onSubmitted={onSubmitted}
    />
  );
}
