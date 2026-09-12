/** Interval helpers for overlap-safe billable AI wall-clock time. */

export type TimeInterval = {
  startMs: number;
  endMs: number;
};

/** Merge overlapping/adjacent intervals; returns total covered milliseconds. */
export function mergeIntervalsDurationMs(intervals: TimeInterval[]): number {
  const valid = intervals
    .filter((row) => Number.isFinite(row.startMs) && Number.isFinite(row.endMs))
    .filter((row) => row.endMs > row.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  if (!valid.length) return 0;

  let total = 0;
  let curStart = valid[0]!.startMs;
  let curEnd = valid[0]!.endMs;

  for (let i = 1; i < valid.length; i += 1) {
    const next = valid[i]!;
    if (next.startMs <= curEnd) {
      curEnd = Math.max(curEnd, next.endMs);
      continue;
    }
    total += curEnd - curStart;
    curStart = next.startMs;
    curEnd = next.endMs;
  }
  total += curEnd - curStart;
  return total;
}

export function msToMinutes(ms: number): number {
  return ms / 60_000;
}
