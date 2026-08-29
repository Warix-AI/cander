/**
 * Extensible clarification-card schema for structured AI questions above the composer.
 */

export type ClarificationQuestionType =
  | "text"
  | "textarea"
  | "single_choice"
  | "multi_choice"
  | "select"
  | "boolean"
  | "number"
  | "date"
  | "time"
  | "datetime"
  | "date_range"
  | "attachment";

export type ClarificationChoice = {
  id: string;
  label: string;
};

export type ClarificationQuestion = {
  id: string;
  type: ClarificationQuestionType;
  label: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  choices?: ClarificationChoice[];
  min?: number;
  max?: number;
};

export type ClarificationCardStatus =
  | "active"
  | "submitted"
  | "cancelled"
  | "skipped";

export type ClarificationCard = {
  id: string;
  threadId: string;
  title: string;
  description?: string;
  questions: ClarificationQuestion[];
  /** Current step index for multi-question Back/Next. */
  stepIndex: number;
  answers: Record<string, unknown>;
  errors: Record<string, string>;
  status: ClarificationCardStatus;
  /** Optional tool to resume after submit (e.g. project.create). */
  resumeTool?: string;
  resumeArguments?: Record<string, unknown>;
  createdAt: string;
};

export type ClarificationSubmitResult = {
  cardId: string;
  title: string;
  answers: Record<string, unknown>;
  skipped: boolean;
  resumeTool?: string;
  resumeArguments?: Record<string, unknown>;
};

export function createClarificationCard(input: {
  threadId: string;
  title: string;
  description?: string;
  questions: ClarificationQuestion[];
  resumeTool?: string;
  resumeArguments?: Record<string, unknown>;
}): ClarificationCard {
  const answers: Record<string, unknown> = {};
  for (const q of input.questions) {
    if (q.defaultValue !== undefined) answers[q.id] = q.defaultValue;
  }
  return {
    id: `clarify-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    threadId: input.threadId,
    title: input.title.trim() || "A few details",
    description: input.description?.trim() || undefined,
    questions: input.questions,
    stepIndex: 0,
    answers,
    errors: {},
    status: "active",
    resumeTool: input.resumeTool,
    resumeArguments: input.resumeArguments,
    createdAt: new Date().toISOString(),
  };
}

export function validateQuestionAnswer(
  question: ClarificationQuestion,
  value: unknown,
): string | null {
  const empty =
    value === undefined ||
    value === null ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0);

  if (question.required !== false && empty) {
    return "This field is required.";
  }
  if (empty) return null;

  switch (question.type) {
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(n)) return "Enter a valid number.";
      if (question.min != null && n < question.min) {
        return `Must be at least ${question.min}.`;
      }
      if (question.max != null && n > question.max) {
        return `Must be at most ${question.max}.`;
      }
      break;
    }
    case "single_choice":
    case "select": {
      const id = String(value);
      if (question.choices && !question.choices.some((c) => c.id === id)) {
        return "Pick one of the listed options.";
      }
      break;
    }
    case "multi_choice": {
      if (!Array.isArray(value)) return "Select one or more options.";
      if (question.choices) {
        const allowed = new Set(question.choices.map((c) => c.id));
        if (value.some((v) => !allowed.has(String(v)))) {
          return "One or more selections are invalid.";
        }
      }
      break;
    }
    case "boolean":
      if (typeof value !== "boolean") return "Choose yes or no.";
      break;
    case "date_range": {
      if (
        !value ||
        typeof value !== "object" ||
        !("start" in (value as object)) ||
        !("end" in (value as object))
      ) {
        return "Pick a start and end date.";
      }
      break;
    }
    default:
      break;
  }
  return null;
}

export function validateClarificationStep(
  card: ClarificationCard,
  questionIds?: string[],
): Record<string, string> {
  const ids =
    questionIds ??
    (card.questions[card.stepIndex]
      ? [card.questions[card.stepIndex]!.id]
      : card.questions.map((q) => q.id));
  const errors: Record<string, string> = {};
  for (const id of ids) {
    const q = card.questions.find((item) => item.id === id);
    if (!q) continue;
    const err = validateQuestionAnswer(q, card.answers[id]);
    if (err) errors[id] = err;
  }
  return errors;
}

export function validateAllClarificationAnswers(
  card: ClarificationCard,
): Record<string, string> {
  return validateClarificationStep(
    card,
    card.questions.map((q) => q.id),
  );
}

export function formatClarificationAnswersForModel(
  result: ClarificationSubmitResult,
): string {
  const lines = [`Clarification submitted for “${result.title}”:`];
  for (const [key, value] of Object.entries(result.answers)) {
    lines.push(`- ${key}: ${JSON.stringify(value)}`);
  }
  if (result.skipped) lines.push("(User skipped remaining optional fields.)");
  return lines.join("\n");
}
