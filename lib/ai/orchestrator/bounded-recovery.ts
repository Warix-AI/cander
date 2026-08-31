/**
 * Bounded recovery — retry unresolved work up to max rounds (v4 §10 step 9).
 */

export type BoundedRecoveryResult<T> = {
  result: T;
  roundsUsed: number;
  exhausted: boolean;
};

export async function runBoundedRecovery<T>(opts: {
  maxRounds: number;
  isComplete: (value: T) => boolean;
  runRound: (round: number) => Promise<T>;
  initial: T;
}): Promise<BoundedRecoveryResult<T>> {
  let current = opts.initial;
  let round = 0;

  while (round < opts.maxRounds && !opts.isComplete(current)) {
    round += 1;
    current = await opts.runRound(round);
  }

  return {
    result: current,
    roundsUsed: round,
    exhausted: round >= opts.maxRounds && !opts.isComplete(current),
  };
}
