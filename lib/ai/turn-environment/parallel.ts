/**
 * Parallel task runner with per-task timeout and early-exit when sufficient.
 */

export type ParallelTask<T> = {
  id: string;
  run: (signal: AbortSignal) => Promise<T>;
};

export type ParallelResult<T> = {
  id: string;
  ok: boolean;
  value?: T;
  error?: string;
  timedOut?: boolean;
  cancelled?: boolean;
};

export async function runParallelTasks<T>(opts: {
  tasks: ParallelTask<T>[];
  concurrency: number;
  timeoutMs: number;
  /** Stop scheduling new work and abort pending when true. */
  isSufficient?: (completed: ParallelResult<T>[]) => boolean;
}): Promise<ParallelResult<T>[]> {
  const { tasks, concurrency, timeoutMs, isSufficient } = opts;
  const results: ParallelResult<T>[] = [];
  const controllers = new Map<string, AbortController>();
  let cursor = 0;
  let active = 0;
  let stopScheduling = false;

  return await new Promise((resolve) => {
    const maybeDone = () => {
      if (stopScheduling && active === 0) {
        resolve(results);
        return;
      }
      if (cursor >= tasks.length && active === 0) {
        resolve(results);
      }
    };

    const launchNext = () => {
      while (
        !stopScheduling &&
        active < concurrency &&
        cursor < tasks.length
      ) {
        const task = tasks[cursor++]!;
        active += 1;
        const ac = new AbortController();
        controllers.set(task.id, ac);
        const timer = setTimeout(() => ac.abort(), timeoutMs);

        void (async () => {
          try {
            const value = await task.run(ac.signal);
            if (ac.signal.aborted) {
              results.push({
                id: task.id,
                ok: false,
                timedOut: true,
                cancelled: true,
                error: "timeout_or_cancelled",
              });
            } else {
              results.push({ id: task.id, ok: true, value });
            }
          } catch (err) {
            const aborted = ac.signal.aborted;
            results.push({
              id: task.id,
              ok: false,
              timedOut: aborted,
              cancelled: aborted,
              error: err instanceof Error ? err.message : String(err),
            });
          } finally {
            clearTimeout(timer);
            controllers.delete(task.id);
            active -= 1;
            if (isSufficient?.(results)) {
              stopScheduling = true;
              for (const c of controllers.values()) c.abort();
            }
            launchNext();
            maybeDone();
          }
        })();
      }
      maybeDone();
    };

    if (!tasks.length) {
      resolve([]);
      return;
    }
    launchNext();
  });
}
