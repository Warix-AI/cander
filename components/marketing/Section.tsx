import { cn } from "@/lib/utils";

export function PageWidth({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative z-[1] mx-auto w-full max-w-[1120px] px-5 md:px-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Section({
  children,
  className,
  id,
  band,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  band?: boolean;
}) {
  return (
    <section id={id} className={cn("relative z-[1] py-10 md:py-14", band && "marketing-band border-y border-border/60 bg-card/40", className)}>
      {children}
    </section>
  );
}

export function SectionHeader({
  kicker,
  title,
  body,
  as = "h2",
  compact,
}: {
  kicker?: string;
  title: string;
  body?: string;
  as?: "h1" | "h2";
  compact?: boolean;
}) {
  const Title = as;
  return (
    <div className={cn("max-w-2xl", compact && "max-w-xl")}>
      {kicker ? (
        <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {kicker}
        </p>
      ) : null}
      <Title
        className={cn(
          "heading-display text-foreground",
          as === "h1"
            ? "mt-2 text-4xl md:text-[3.25rem]"
            : "mt-1.5 text-2xl md:text-3xl",
        )}
      >
        {title}
      </Title>
      {body ? (
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground md:text-[16px]">
          {body}
        </p>
      ) : null}
    </div>
  );
}

export function MediaPanel({
  media,
  children,
  className,
  watermark,
}: {
  media: string;
  children?: React.ReactNode;
  className?: string;
  watermark?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[10px] text-white",
        media,
        className,
      )}
    >
      <div className="grain-layer" />
      {watermark ? (
        <p className="relative px-5 pt-5 text-4xl font-semibold tracking-[-0.06em] text-white/90 md:text-5xl">
          {watermark}
        </p>
      ) : null}
      {children ? (
        <div className="relative mt-auto px-5 pb-5 pt-10">{children}</div>
      ) : null}
    </div>
  );
}
