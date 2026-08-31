/**
 * Model call scheduler — budget by category, not flat count (v4 §6).
 */

export type ModelCallCategory =
  | "planning"
  | "semantic"
  | "generation"
  | "tool_round";

export type ModelSchedulerBudget = {
  planning: number;
  semantic: number;
  generation: number;
  toolRound: number;
};

export const DEFAULT_MODEL_BUDGET: ModelSchedulerBudget = {
  planning: 1,
  semantic: 3,
  generation: 2,
  toolRound: 2,
};

export type ModelSchedulerSnapshot = {
  budget: ModelSchedulerBudget;
  used: Record<ModelCallCategory, number>;
  blocked: ModelCallCategory[];
};

let activeScheduler: ModelScheduler | null = null;

export class ModelScheduler {
  private used: Record<ModelCallCategory, number> = {
    planning: 0,
    semantic: 0,
    generation: 0,
    tool_round: 0,
  };

  private budget: ModelSchedulerBudget;

  constructor(budget: ModelSchedulerBudget = DEFAULT_MODEL_BUDGET) {
    this.budget = budget;
  }

  static start(budget?: Partial<ModelSchedulerBudget>): ModelScheduler {
    activeScheduler = new ModelScheduler({
      ...DEFAULT_MODEL_BUDGET,
      ...budget,
    });
    return activeScheduler;
  }

  static current(): ModelScheduler | null {
    return activeScheduler;
  }

  static reset(): void {
    activeScheduler = null;
  }

  canCall(category: ModelCallCategory): boolean {
    const key = category === "tool_round" ? "toolRound" : category;
    const cap = this.budget[key as keyof ModelSchedulerBudget];
    return this.used[category] < cap;
  }

  record(category: ModelCallCategory): boolean {
    if (!this.canCall(category)) return false;
    this.used[category] += 1;
    return true;
  }

  snapshot(): ModelSchedulerSnapshot {
    const blocked: ModelCallCategory[] = [];
    for (const cat of [
      "planning",
      "semantic",
      "generation",
      "tool_round",
    ] as ModelCallCategory[]) {
      if (!this.canCall(cat)) blocked.push(cat);
    }
    return {
      budget: { ...this.budget },
      used: { ...this.used },
      blocked,
    };
  }
}

/** Map FM round to scheduler category. */
export function categoryForFmRound(round: number): ModelCallCategory {
  if (round < 0) return "planning";
  if (round === 0) return "generation";
  return "tool_round";
}
