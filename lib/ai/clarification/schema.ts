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
  for (const row of formatClarificationAnswersForDisplay(result.answers)) {
    lines.push(`- ${row.label}: ${JSON.stringify(row.raw)}`);
  }
  if (result.skipped) lines.push("(User skipped remaining optional fields.)");
  return lines.join("\n");
}

/** Space ids used by project.create (Explore UI label → research). */
export function normalizeSpaceAnswer(
  value: unknown,
): "build" | "research" | "work" | null {
  if (typeof value !== "string") return null;
  const s = value.trim().toLowerCase();
  if (s === "build") return "build";
  if (s === "research" || s === "explore" || s === "explorer") return "research";
  if (s === "work") return "work";
  return null;
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

function spaceDisplayLabel(space: "build" | "research" | "work"): string {
  if (space === "research") return "Explore";
  if (space === "build") return "Build";
  return "Work";
}

/** Human-readable rows for transcript chips (never show `undefined:`). */
export function formatClarificationAnswersForDisplay(
  answers: Record<string, unknown>,
): Array<{ label: string; value: string; raw: unknown }> {
  const rows: Array<{ label: string; value: string; raw: unknown }> = [];
  const seenSpace = { current: false };

  for (const [key, value] of Object.entries(answers)) {
    const badKey = !key.trim() || key === "undefined" || key === "null";
    const space = normalizeSpaceAnswer(value);
    if (space && (badKey || key === "space" || key === "type")) {
      if (seenSpace.current && key !== "space") continue;
      seenSpace.current = true;
      rows.push({
        label: "Space",
        value: spaceDisplayLabel(space),
        raw: space,
      });
      continue;
    }
    if (badKey) {
      const text = pickString(value);
      if (text) {
        rows.push({ label: "Answer", value: text, raw: value });
      }
      continue;
    }
    const label =
      key === "space"
        ? "Space"
        : key === "title" || key === "name" || key === "project_name"
          ? "Title"
          : key;
    if (space) {
      rows.push({
        label,
        value: spaceDisplayLabel(space),
        raw: space,
      });
      continue;
    }
    rows.push({
      label,
      value:
        typeof value === "string" ? value : JSON.stringify(value),
      raw: value,
    });
  }
  return rows;
}

/** Merge clarification answers into project.create args. */
export function normalizeProjectCreateFromClarification(
  answers: Record<string, unknown>,
  resumeArguments?: Record<string, unknown>,
): { title: string; space?: "build" | "research" | "work" } {
  const merged: Record<string, unknown> = {
    ...(resumeArguments ?? {}),
    ...answers,
  };
  let title =
    pickString(merged.title) ??
    pickString(merged.name) ??
    pickString(merged.project_name) ??
    pickString(answers.title) ??
    pickString(answers.name) ??
    pickString(answers.project_name);

  let space =
    normalizeSpaceAnswer(merged.space) ??
    normalizeSpaceAnswer(answers.space);

  if (!space) {
    for (const value of Object.values(answers)) {
      space = normalizeSpaceAnswer(value);
      if (space) break;
    }
  }
  if (!title) {
    for (const [key, value] of Object.entries(answers)) {
      if (key === "space" || normalizeSpaceAnswer(value)) continue;
      const text = pickString(value);
      if (text && !normalizeSpaceAnswer(text)) {
        title = text;
        break;
      }
    }
  }

  return {
    title: title || "Untitled project",
    space: space ?? undefined,
  };
}

/** Ensure every question/choice has a stable id; upgrade free-text space asks to choices. */
export function sanitizeClarificationQuestions(
  questions: ClarificationQuestion[],
): ClarificationQuestion[] {
  return questions.map((q, i) => {
    const rawId = typeof q.id === "string" ? q.id.trim() : "";
    const id =
      rawId && rawId !== "undefined" && rawId !== "null" ? rawId : `q${i}`;

    const choices = (q.choices ?? []).map((c, j) => {
      const rawChoiceId = typeof c.id === "string" ? c.id.trim() : "";
      const label = (c.label || rawChoiceId || `Option ${j + 1}`).trim();
      let choiceId =
        rawChoiceId && rawChoiceId !== "undefined" && rawChoiceId !== "null"
          ? rawChoiceId
          : "";
      const fromLabel = normalizeSpaceAnswer(label);
      const fromId = normalizeSpaceAnswer(choiceId);
      if (fromId) choiceId = fromId;
      else if (fromLabel) choiceId = fromLabel;
      else if (!choiceId) choiceId = `opt${j}`;
      const display =
        choiceId === "research"
          ? "Explore"
          : choiceId === "build"
            ? "Build"
            : choiceId === "work"
              ? "Work"
              : label;
      return { id: choiceId, label: display };
    });

    const blob = `${q.label ?? ""} ${q.description ?? ""} ${q.placeholder ?? ""}`.toLowerCase();
    const asksSpace =
      id === "space" ||
      /\b(build|research|explore)\b/.test(blob);
    if (
      asksSpace &&
      (q.type === "text" || q.type === "textarea") &&
      choices.length < 2
    ) {
      return {
        id: "space",
        type: "single_choice" as const,
        label: "Which space should this live in?",
        required: true,
        choices: [
          { id: "build", label: "Build" },
          { id: "research", label: "Explore" },
        ],
      };
    }

    // Single free-text "build or research and title" → split is handled by
    // looksLikeBrokenCreateProjectCard + replacement; here just fix ids.
    if (
      asksSpace &&
      (q.type === "single_choice" || q.type === "select") &&
      choices.length >= 2
    ) {
      return {
        ...q,
        id: id === "type" || id.startsWith("q") ? "space" : id,
        choices,
      };
    }

    return {
      ...q,
      id,
      choices: choices.length ? choices : q.choices,
    };
  });
}

export function looksLikeBrokenCreateProjectCard(opts: {
  title: string;
  questions: ClarificationQuestion[];
}): boolean {
  const t = opts.title.toLowerCase();
  if (!/\bproject\b/.test(t) && !/\bnew project\b/.test(t)) return false;
  const hasProperSpace = opts.questions.some(
    (q) =>
      (q.id === "space" || /\bspace\b/i.test(q.label)) &&
      (q.type === "single_choice" || q.type === "select") &&
      (q.choices?.length ?? 0) >= 2,
  );
  return !hasProperSpace;
}

export const CREATE_PROJECT_SPACE_QUESTIONS: ClarificationQuestion[] = [
  {
    id: "space",
    type: "single_choice",
    label: "Which space should this live in?",
    required: true,
    choices: [
      { id: "build", label: "Build" },
      { id: "research", label: "Explore" },
    ],
  },
  {
    id: "title",
    type: "text",
    label: "What should we name it?",
    required: true,
    placeholder: "Project name",
  },
];

