"use client";

import { useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

function QuestionField({
  question,
  value,
  error,
  onChange,
}: {
  question: ClarificationQuestion;
  value: unknown;
  error?: string;
  onChange: (next: unknown) => void;
}) {
  const inputClass =
    "w-full rounded-[10px] border border-border bg-input px-3 py-2 text-[14px] outline-none focus:border-foreground/30";

  switch (question.type) {
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
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium">{question.label}</label>
          <div className="flex flex-wrap gap-2">
            {(question.choices ?? []).map((c) => {
              const on = selected.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    onChange(
                      on
                        ? selected.filter((id) => id !== c.id)
                        : [...selected, c.id],
                    )
                  }
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[13px]",
                    on
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {error ? (
            <p className="text-[12px] text-destructive">{error}</p>
          ) : null}
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
}: {
  card: ClarificationCardModel;
  onSubmitted?: (result: ClarificationSubmitResult) => void;
}) {
  const q = card.questions[card.stepIndex];
  const isLast = card.stepIndex >= card.questions.length - 1;
  const isFirst = card.stepIndex <= 0;

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
            <p className="mt-1 text-[11px] text-muted-foreground">
              {card.stepIndex + 1} of {card.questions.length}
            </p>
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

      <div className="px-4 py-3">
        {q ? (
          <QuestionField
            question={q}
            value={card.answers[q.id]}
            error={card.errors[q.id]}
            onChange={(next) =>
              patchClarificationAnswers(card.threadId, { [q.id]: next })
            }
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
              onClick={() => clarificationNext(card.threadId)}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12.5px] text-muted-foreground hover:bg-muted"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="flex gap-1.5">
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
          <button
            type="button"
            onClick={() => {
              if (!isLast) {
                clarificationNext(card.threadId);
                return;
              }
              const result = submitClarification(card.threadId);
              if (result) onSubmitted?.(result);
            }}
            className="rounded-full bg-foreground px-3 py-1.5 text-[12.5px] font-medium text-background"
          >
            {isLast ? "Submit" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Composer-adjacent clarification card for the active thread. */
export function ClarificationCardSlot({
  threadId,
  onSubmitted,
}: {
  threadId: string | null | undefined;
  onSubmitted?: (result: ClarificationSubmitResult) => void;
}) {
  const card = useSyncExternalStore(
    subscribeClarificationStore,
    () => getActiveClarification(threadId),
    () => null,
  );
  if (!card) return null;
  return <ClarificationCardView card={card} onSubmitted={onSubmitted} />;
}
