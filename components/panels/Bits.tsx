import { cn } from "@/lib/utils";

export function Row({
  title,
  meta,
  onClick,
  active,
}: {
  title: string;
  meta?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const className = cn(
    "flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-200",
    onClick && "hover:bg-muted",
    active && "bg-muted",
  );
  const body = (
    <>
      <span className="truncate text-[13.5px] tracking-[-0.015em]">{title}</span>
      {meta ? (
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-3 pb-1 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

export function StatLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[12px]">{value}</span>
    </div>
  );
}
