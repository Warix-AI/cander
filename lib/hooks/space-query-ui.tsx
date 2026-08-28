"use client";

/** Static placeholder rows — no pulse animation. */
export function QuerySkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mt-3 space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-16 rounded-[10px] bg-muted/40"
        />
      ))}
    </div>
  );
}

export function QueryError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mt-3 rounded-[10px] border border-border px-3 py-3 text-[13px]">
      <p className="text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-[13px] font-medium text-foreground underline-offset-2 hover:underline"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
