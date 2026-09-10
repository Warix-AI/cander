/**
 * Bounded consecutive-unhealthy tracking for draft preview polls.
 * Grace attempts tolerate transient 5xx (cold compile) without failing.
 */

export function nextUnhealthyStreakState(opts: {
  attemptIndex: number;
  hardUnhealthy: boolean;
  consecutiveUnhealthy: number;
  graceAttempts: number;
  consecutiveUnhealthyLimit: number;
}): { consecutiveUnhealthy: number; shouldFail: boolean } {
  if (!opts.hardUnhealthy) {
    return { consecutiveUnhealthy: 0, shouldFail: false };
  }
  let consecutive = opts.consecutiveUnhealthy;
  if (opts.attemptIndex >= opts.graceAttempts) {
    consecutive += 1;
  }
  return {
    consecutiveUnhealthy: consecutive,
    shouldFail: consecutive >= opts.consecutiveUnhealthyLimit,
  };
}
